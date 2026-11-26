import { SessionUser } from "@crm/core/api";
import type { AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";
import { Effect, Option, Schema } from "effect";

const decodeUser = Schema.decodeUnknownEffect(SessionUser);

export function sessionAuthFor(user: SessionUser): SessionAuthContext {
  return {
    authenticator: "crm-session",
    principalType: "user",
    principalId: user.id,
    subject: user.email,
    attributes: { name: user.name, email: user.email },
  };
}

/**
 * Route auth backed by the CRM's better-auth session. The caller's cookie is
 * forwarded to the CRM API, which stays the single session authority; the agent
 * never reads auth tables or secrets itself.
 */
export type Fetcher = (url: URL, init: { headers: Record<string, string> }) => Promise<Response>;

export function crmSession(apiUrl: string, fetcher: Fetcher = fetch): AuthFn<Request> {
  return async (request) => {
    const cookie = request.headers.get("cookie");

    if (!cookie) return null;

    const response = await fetcher(new URL("/api/account/me", apiUrl), { headers: { cookie } });

    if (!response.ok) return null;

    const user = await Effect.runPromise(Effect.option(decodeUser(await response.json())));

    return Option.match(user, { onNone: () => null, onSome: sessionAuthFor });
  };
}
