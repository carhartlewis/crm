import { Client } from "eve/client";

/** The person a chat request acts for, as the agent's `crmProxy` auth reads them. */
export interface AgentCaller {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  /**
   * The chat's workspace. The agent signs it into the tokens it uses for connections, skills
   * and memory, so they act in this workspace (ADR 0018).
   */
  readonly workspaceId?: string | null;
  /** The chat's permission mode (ADR 0019); the agent decides each tool call with it. */
  readonly permissionMode?: string;
  /** The record the chat is about (ADR 0024); the agent reads it before each turn. */
  readonly record?: { readonly kind: string; readonly id: string };
}

/** What the chats service needs from the agent (ADR 0018). Tests inject a fake. */
export interface ChatAgent {
  /** Creates an idle session for the caller and returns its id. */
  createSession(caller: AgentCaller): Promise<string>;
  /** The events after `startIndex`, up to the stream's current end, and the cursor after them. */
  readEvents(
    caller: AgentCaller,
    sessionId: string,
    startIndex: number,
  ): Promise<{ events: readonly unknown[]; streamIndex: number }>;
  endSession(sessionId: string): Promise<void>;
  /** Forwards a browser request to `path` on the agent, as the caller. */
  forward(caller: AgentCaller, path: string, request: Request): Promise<Response>;
}

/** Headers the agent's `crmProxy` auth trusts, because only the API knows the secret. */
export interface CallerHeaders {
  authorization: string;
  "x-crm-user-id"?: string;
  "x-crm-user-name"?: string;
  "x-crm-user-email"?: string;
  "x-crm-workspace-id"?: string;
  "x-crm-permission-mode"?: string;
  "x-crm-record-kind"?: string;
  "x-crm-record-id"?: string;
}

export function callerHeaders(secret: string, caller: AgentCaller | null) {
  const headers: CallerHeaders = { authorization: `Bearer ${secret}` };

  if (caller) {
    headers["x-crm-user-id"] = caller.id;
    // Header values are Latin-1; names can be anything, so they travel URI-encoded.
    headers["x-crm-user-name"] = encodeURIComponent(caller.name);
    headers["x-crm-user-email"] = encodeURIComponent(caller.email);

    if (caller.workspaceId) headers["x-crm-workspace-id"] = caller.workspaceId;

    if (caller.permissionMode) headers["x-crm-permission-mode"] = caller.permissionMode;

    if (caller.record) {
      headers["x-crm-record-kind"] = caller.record.kind;
      headers["x-crm-record-id"] = caller.record.id;
    }
  }

  return { ...headers };
}

/** Request headers kept on a forwarded request; cookies and the browser's auth never reach eve. */
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "last-event-id"];

/** Response headers kept: eve's protocol headers, the content type and the cache rule. */
const keepResponseHeader = (name: string) =>
  name.startsWith("x-eve-") || name === "content-type" || name === "cache-control";

/** The response the browser gets: eve's status and streamed body, with only eve's headers. */
export function proxiedResponse(upstream: Response) {
  const headers = new Headers({ "cache-control": "no-store" });

  for (const [name, value] of upstream.headers) {
    if (keepResponseHeader(name)) headers.set(name, value);
  }

  headers.set("vary", "Cookie");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

/** The eve agent at `agentUrl`, called with the shared proxy secret. */
export function eveChatAgent(agentUrl: URL, secret: string): ChatAgent {
  const clientFor = (caller: AgentCaller | null) =>
    new Client({ baseUrl: agentUrl.origin, headers: callerHeaders(secret, caller) });

  return {
    createSession: async (caller) => (await clientFor(caller).sessions.create()).session.id,

    readEvents: async (caller, sessionId, startIndex) => {
      const session = clientFor(caller).sessions.attach(sessionId, { streamIndex: startIndex });
      const events: unknown[] = [];

      for await (const event of session.stream({ follow: false })) events.push(event);

      return { events, streamIndex: session.state.streamIndex };
    },

    endSession: async (sessionId) => {
      await clientFor(null).sessions.attach(sessionId).end({ reason: "chat deleted" });
    },

    forward: async (caller, path, request) => {
      const source = new URL(request.url);
      const target = new URL(path + source.search, agentUrl.origin);
      const headers = new Headers(callerHeaders(secret, caller));

      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);

        if (value !== null) headers.set(name, value);
      }

      const upstream = await fetch(target, {
        method: request.method,
        headers,
        // Messages and controls are small JSON bodies; only the response streams.
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.arrayBuffer(),
        redirect: "manual",
        signal: request.signal,
      });

      return proxiedResponse(upstream);
    },
  };
}

/**
 * Starts a session on the agent with its first message and returns at once; the turn runs on the
 * agent. `operationId` makes a retry start it only once (eve's create-once key).
 */
export async function startAgentSession(
  agentUrl: URL,
  secret: string,
  caller: AgentCaller,
  message: string,
  operationId: string,
) {
  const headers = new Headers(callerHeaders(secret, caller));

  headers.set("content-type", "application/json");

  const response = await fetch(new URL("/eve/v1/session", agentUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({ message, operationId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`agent refused the session: ${response.status}`);
}
