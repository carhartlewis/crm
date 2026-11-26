import {
  CODE_TTL_SECONDS,
  HANDOFF_COOKIE,
  HandoffStart,
  START_TTL_SECONDS,
  codeKey,
  randomSecret,
  safeEqual,
  sha256,
  startKey,
} from "@crm/core/auth/desktop-handoff";
import type { Kv } from "@crm/core/kv";
import {
  type DesktopCallback,
  type DesktopStart,
  desktopCallbackUrl,
  loopbackUrl,
} from "../http/desktop.ts";

export interface HandoffSession {
  userId: string;
  createdAt: Date;
}

/** Everything the handoff needs, injected so the flow is tested without Google or a database. */
export interface HandoffDeps {
  kv: Kv;
  apiOrigin: URL;
  now: () => number;
  /** better-auth `signInSocial` for Google: returns the provider URL and its state cookies. */
  startGoogle: (callbackURL: string) => Promise<{ url: string; cookies: string[] }>;
  session: (headers: Headers) => Promise<HandoffSession | null>;
  /** Signs the browser out; returns the cookie-clearing headers. */
  signOut: (headers: Headers) => Promise<string[]>;
}

const START_LIMIT = { max: 10, windowSeconds: 60 };

const invalidLink = () =>
  new Response("This sign-in link is invalid or expired. Start again from the CRM app.", {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

function readCookie(headers: Headers, name: string) {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) return value.join("=");
  }

  return undefined;
}

function redirect(location: URL | string, cookies: string[]) {
  const headers = new Headers({ location: String(location), "cache-control": "no-store" });

  for (const cookie of cookies) headers.append("set-cookie", cookie);

  return new Response(null, { status: 302, headers });
}

export function makeDesktopHandoff(deps: HandoffDeps) {
  const secure = deps.apiOrigin.protocol === "https:";

  const nonceCookie = (value: string, maxAge: number) =>
    `${HANDOFF_COOKIE}=${value}; Path=/api/desktop; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

  return {
    async start(request: DesktopStart, clientIp: string | undefined) {
      const attempts = await deps.kv.increment(
        `desktop-handoff:rate:${clientIp ?? "unknown"}`,
        START_LIMIT.windowSeconds,
      );

      if (attempts > START_LIMIT.max)
        return new Response("Too many sign-in attempts", { status: 429 });

      if ((await deps.kv.get(startKey(request.state))) !== null) return invalidLink();

      const nonce = randomSecret();

      const record: HandoffStart = {
        port: request.port,
        challenge: request.challenge,
        nonceHash: await sha256(nonce),
        startedAt: deps.now(),
      };

      await deps.kv.set(startKey(request.state), JSON.stringify(record), START_TTL_SECONDS);

      const google = await deps.startGoogle(desktopCallbackUrl(deps.apiOrigin, request).href);

      return redirect(google.url, [...google.cookies, nonceCookie(nonce, START_TTL_SECONDS)]);
    },

    async finish(headers: Headers, callback: DesktopCallback, oauthError: string | null) {
      // Single use: consumed before any check, so a replayed callback always fails.
      const raw = await deps.kv.take(startKey(callback.state));
      const parsed = raw === null ? null : HandoffStart.safeParse(JSON.parse(raw));
      const record = parsed?.success ? parsed.data : null;
      const nonce = readCookie(headers, HANDOFF_COOKIE);

      // Same browser that started this attempt (nonce cookie), and the same app listener.
      if (!record || record.port !== callback.port || !nonce) return invalidLink();

      if (!safeEqual(await sha256(nonce), record.nonceHash)) return invalidLink();

      const clearNonce = nonceCookie("", 0);

      if (oauthError)
        return redirect(loopbackUrl(callback, { error: "google_failed" }), [clearNonce]);

      const session = await deps.session(headers);

      // Only a sign-in completed during this attempt is handed over, never an older session.
      if (!session || session.createdAt.getTime() < record.startedAt) {
        return redirect(loopbackUrl(callback, { error: "not_signed_in" }), [clearNonce]);
      }

      const code = randomSecret();

      await deps.kv.set(
        codeKey(await sha256(code)),
        JSON.stringify({ userId: session.userId, challenge: record.challenge }),
        CODE_TTL_SECONDS,
      );

      // The browser only signed in to serve the app; don't leave it with a CRM session.
      const signedOut = await deps.signOut(headers);

      return redirect(loopbackUrl(callback, { code }), [clearNonce, ...signedOut]);
    },
  };
}

export type DesktopHandoff = ReturnType<typeof makeDesktopHandoff>;
