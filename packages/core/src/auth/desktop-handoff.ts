import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";

/**
 * Desktop sign-in handoff (RFC 8252: system browser + loopback redirect + PKCE).
 *
 * 1. start  (apps/api): the app sends `port`, `state`, and a PKCE `challenge`. The API stores
 *    `start:<state>` with a hash of a nonce it also sets as an HttpOnly cookie, then sends the
 *    browser to Google.
 * 2. finish (apps/api): Google returns to the same browser. The API consumes `start:<state>`,
 *    checks the nonce cookie (same browser) and that the session was created after the start
 *    (a fresh sign-in, never an older session), stores `code:<hash>` → user + challenge, signs
 *    the browser out, and redirects to the app's 127.0.0.1 listener with the code.
 * 3. redeem (this plugin): the app posts the code with the PKCE verifier. Only the app that
 *    started the flow holds the verifier. A new desktop-only session is created and set as the
 *    window's cookie. Codes are single-use (atomic take) and live two minutes.
 */

export const HANDOFF_COOKIE = "crm_desktop_handoff";
export const START_TTL_SECONDS = 10 * 60;
export const CODE_TTL_SECONDS = 2 * 60;

export const startKey = (state: string) => `desktop-handoff:start:${state}`;
export const codeKey = (codeHash: string) => `desktop-handoff:code:${codeHash}`;

export const HandoffStart = z.object({
  port: z.number().int().min(1024).max(65_535),
  challenge: z.string().regex(/^[\w-]{43}$/),
  nonceHash: z.string().min(1),
  startedAt: z.number(),
});

export type HandoffStart = z.infer<typeof HandoffStart>;

export const HandoffCode = z.object({ userId: z.string().min(1), challenge: z.string() });

export type HandoffCode = z.infer<typeof HandoffCode>;

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** URL-safe random secret (codes, nonces, verifiers). */
export function randomSecret(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256, base64url: the PKCE S256 transform, also used to store secrets hashed. */
export async function sha256(value: string) {
  return base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

export async function verifyPkce(verifier: string, challenge: string) {
  return safeEqual(await sha256(verifier), challenge);
}

const RedeemBody = z.object({
  code: z.string().regex(/^[\w-]{43}$/),
  verifier: z.string().regex(/^[\w-]{43,128}$/),
});

const invalid = () =>
  new APIError("BAD_REQUEST", { message: "Sign-in code is invalid or expired" });

export const desktopHandoff = () =>
  ({
    id: "desktop-handoff",
    endpoints: {
      redeemDesktopHandoff: createAuthEndpoint(
        "/desktop/redeem",
        { method: "POST", body: RedeemBody },
        async (ctx) => {
          const storage = ctx.context.secondaryStorage;

          if (!storage)
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Secondary storage required" });

          // Single use: the record is taken atomically before anything else is checked.
          const raw = await storage.getAndDelete(codeKey(await sha256(ctx.body.code)));
          const stored = z.string().safeParse(raw);
          const record = stored.success ? HandoffCode.safeParse(JSON.parse(stored.data)) : null;

          if (!record?.success || !(await verifyPkce(ctx.body.verifier, record.data.challenge)))
            throw invalid();

          const user = await ctx.context.internalAdapter.findUserById(record.data.userId);

          if (!user) throw invalid();

          const session = await ctx.context.internalAdapter.createSession(user.id);

          await setSessionCookie(ctx, { session, user });

          return ctx.json({ ok: true });
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path === "/desktop/redeem", window: 60, max: 10 }],
  }) satisfies BetterAuthPlugin;
