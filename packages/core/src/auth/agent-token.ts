/**
 * Agent tokens (ADR 0018): how the eve agent calls the CRM API for a chat's caller. The API
 * already checked the caller when it forwarded the chat request, and it named the user and the
 * chat's workspace. The agent signs those two with the secret both share (`AGENT_PROXY_SECRET`)
 * for a few minutes, so connections, skills and memory need no separate sign-in. The API checks
 * the signature, the expiry and the membership again on every call.
 *
 * Format: `crm1.<base64url JSON { u, w, exp, o?, r? }>.<base64url HMAC-SHA256>`. `o` is what runs
 * the turn and `r` the record it is about (`kind:id`), so paid calls are filed under them
 * (ADR 0027); they grant nothing.
 */

import { Option, Schema } from "effect";

export const AGENT_TOKEN_PREFIX = "crm1.";

/** How long a minted token is valid. */
export const AGENT_TOKEN_TTL_MS = 5 * 60 * 1000;

export type AgentTokenOrigin = "chat" | "research" | "sheet";

export interface AgentTokenClaims {
  readonly userId: string;
  readonly workspaceId: string;
  readonly origin?: AgentTokenOrigin;
  readonly record?: { readonly kind: string; readonly id: string } | null;
}

const encoder = new TextEncoder();

// Buffer, not `Uint8Array#toBase64`: the agent runs on Node, which lacks the newer method.
const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

const fromBase64url = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

async function sign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return {
    key,
    signature: new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))),
  };
}

export async function mintAgentToken(
  secret: string,
  claims: AgentTokenClaims,
  now: number = Date.now(),
) {
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        u: claims.userId,
        w: claims.workspaceId,
        exp: now + AGENT_TOKEN_TTL_MS,
        // Undefined fields drop out of the JSON.
        o: claims.origin,
        r: claims.record ? `${claims.record.kind}:${claims.record.id}` : undefined,
      }),
    ),
  );

  const { signature } = await sign(secret, `${AGENT_TOKEN_PREFIX}${payload}`);

  return `${AGENT_TOKEN_PREFIX}${payload}.${base64url(signature)}`;
}

export function isAgentToken(token: string) {
  return token.startsWith(AGENT_TOKEN_PREFIX);
}

const Payload = Schema.fromJsonString(
  Schema.Struct({
    u: Schema.String,
    w: Schema.String,
    exp: Schema.Number,
    o: Schema.optional(Schema.Literals(["chat", "research", "sheet"])),
    r: Schema.optional(Schema.String),
  }),
);

const decodePayload = Schema.decodeUnknownOption(Payload);

/** The claims of a valid, unexpired token signed with `secret`; null for anything else. */
export async function verifyAgentToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): Promise<AgentTokenClaims | null> {
  if (!isAgentToken(token)) return null;

  const [payload, signature] = token.slice(AGENT_TOKEN_PREFIX.length).split(".");

  if (!payload || !signature) return null;

  try {
    const { key } = await sign(secret, "");

    // `verify` compares in constant time.
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(signature),
      encoder.encode(`${AGENT_TOKEN_PREFIX}${payload}`),
    );

    if (!valid) return null;

    const claims = Option.getOrNull(
      decodePayload(new TextDecoder().decode(fromBase64url(payload))),
    );

    if (!claims?.u || !claims.w || claims.exp < now) return null;

    const [kind, id] = claims.r?.split(":") ?? [];

    return {
      userId: claims.u,
      workspaceId: claims.w,
      origin: claims.o,
      record: kind && id ? { kind, id } : undefined,
    };
  } catch {
    return null;
  }
}
