import { timingSafeEqual } from "node:crypto";
import type { AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

/**
 * Route auth for chats (ADR 0018). Browsers never reach the agent: the CRM API checks the
 * session and that the caller may see the chat, then forwards the request with the shared
 * secret and the caller in headers. eve has no access list per session, so accepting a cookie
 * here would let anyone who knew a session id read a chat that was later made private.
 */
/** What the API tells the agent about a chat's caller. */
type CallerAttributes = {
  name: string;
  email: string;
  workspaceId?: string;
  permissionMode?: string;
  /** The record a chat from a record sheet is about (ADR 0024). */
  recordKind?: string;
  recordId?: string;
};

export function crmProxy(secret: string | undefined): AuthFn<Request> {
  const expected =
    secret && secret.length >= 32 ? new TextEncoder().encode(`Bearer ${secret}`) : null;

  return async (request): Promise<SessionAuthContext | null> => {
    const sent = request.headers.get("authorization");

    if (!expected || sent === null) return null;

    const given = new TextEncoder().encode(sent);

    // Constant time: the comparison must not reveal how much of the secret matched.
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const id = request.headers.get("x-crm-user-id");

    // The API itself (ending a deleted chat's session) calls without a user.
    if (!id) {
      return {
        authenticator: "crm-proxy",
        principalType: "service",
        principalId: "crm-api",
        attributes: {},
      } satisfies SessionAuthContext;
    }

    const name = decodeURIComponent(request.headers.get("x-crm-user-name") ?? "");
    const email = decodeURIComponent(request.headers.get("x-crm-user-email") ?? "");
    // The chat's workspace: connections, skills and memory act in it (ADR 0018).
    const workspaceId = request.headers.get("x-crm-workspace-id") ?? "";
    // The chat's permission mode (ADR 0019): tool approvals read it each call.
    const permissionMode = request.headers.get("x-crm-permission-mode") ?? "";
    const attributes: CallerAttributes = { name, email };

    if (workspaceId) attributes.workspaceId = workspaceId;

    if (permissionMode) attributes.permissionMode = permissionMode;

    const recordKind = request.headers.get("x-crm-record-kind") ?? "";
    const recordId = request.headers.get("x-crm-record-id") ?? "";

    if (recordKind && recordId) {
      attributes.recordKind = recordKind;
      attributes.recordId = recordId;
    }

    return {
      authenticator: "crm-proxy",
      principalType: "user",
      principalId: id,
      subject: email,
      attributes,
    } satisfies SessionAuthContext;
  };
}
