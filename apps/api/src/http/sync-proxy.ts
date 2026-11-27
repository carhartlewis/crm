/**
 * Electric shape proxy: pure URL and header rules. The route (routes.ts) authenticates the
 * session and picks the workspace; these functions decide exactly what reaches Electric and what
 * comes back to the browser.
 */

/**
 * Electric protocol params a client may send, from `ELECTRIC_PROTOCOL_QUERY_PARAMS` in
 * `@electric-sql/client` 1.5.x. Everything else (`table`, `where`, `params[*]`, `columns`,
 * `replica`, `secret`, `workspace`) is dropped or set by the server. The `subset__*` params
 * only narrow a snapshot inside the server-fixed shape; they cannot widen it.
 */
export const ELECTRIC_PROTOCOL_PARAMS: ReadonlySet<string> = new Set([
  "live",
  "live_sse",
  "experimental_live_sse",
  "handle",
  "offset",
  "cursor",
  "expired_handle",
  "log",
  "subset__where",
  "subset__limit",
  "subset__offset",
  "subset__order_by",
  "subset__params",
  "subset__where_expr",
  "subset__order_by_expr",
  "cache-buster",
]);

/** A shape the server defines: one table and a parameterised row filter. */
export interface SyncSpec {
  table: string;
  where: string;
  /** Positional values for `$1`, `$2`, … in `where`. */
  params: readonly string[];
  /** The columns that reach the browser (primary key included); all of them when absent. */
  columns?: readonly string[];
}

/** The `/v1/shape` URL for `spec`, carrying only the client's protocol params. */
export function electricUrlFor(
  electric: URL,
  secret: string,
  client: URLSearchParams,
  spec: SyncSpec,
) {
  const url = new URL("/v1/shape", electric);

  for (const [key, value] of client) {
    if (ELECTRIC_PROTOCOL_PARAMS.has(key)) url.searchParams.append(key, value);
  }

  url.searchParams.set("table", spec.table);
  url.searchParams.set("where", spec.where);

  if (spec.columns) url.searchParams.set("columns", spec.columns.join(","));

  for (const [index, value] of spec.params.entries()) {
    url.searchParams.set(`params[${index + 1}]`, value);
  }

  url.searchParams.set("secret", secret);

  return url;
}

/** Request headers forwarded to Electric: only the conditional-request validator. */
export function electricRequestHeaders(incoming: Headers) {
  const headers = new Headers();
  const etag = incoming.get("if-none-match");

  if (etag) headers.set("if-none-match", etag);

  return headers;
}

/**
 * Shape data is per user, so a shared cache must never store it: `public` becomes `private` and
 * `s-maxage` (shared caches only) is dropped. The browser keeps Electric's freshness rules.
 */
export function privateCacheControl(value: string | null) {
  const directives = (value ?? "")
    .split(",")
    .map((directive) => directive.trim())
    .filter((directive) => {
      const name = directive.split("=")[0]?.toLowerCase() ?? "";

      return name !== "" && name !== "public" && name !== "private" && name !== "s-maxage";
    });

  return directives.length > 0 ? ["private", ...directives].join(", ") : "private, no-store";
}

const KEPT_HEADERS = new Set(["content-type", "etag", "retry-after"]);

/**
 * Response headers for the browser. Keeps Electric's `electric-*` headers, the content type, the
 * ETag and `retry-after`. Drops hop-by-hop and encoding headers (fetch already decoded the body,
 * so `content-encoding`/`content-length` would be wrong), and Electric's own CORS and `vary`.
 */
export function proxyResponseHeaders(upstream: Headers) {
  const headers = new Headers();

  for (const [key, value] of upstream) {
    if (key.startsWith("electric-") || KEPT_HEADERS.has(key)) headers.set(key, value);
  }

  headers.set("cache-control", privateCacheControl(upstream.get("cache-control")));
  headers.set("vary", "Cookie");

  return headers;
}

/** The browser response: Electric's status and streamed body with the proxied headers. */
export function proxyResponse(upstream: Response) {
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: proxyResponseHeaders(upstream.headers),
  });
}

/** Companies of one workspace. The workspace id is bound as a parameter, never spliced in. */
export function companiesSync(workspaceId: string): SyncSpec {
  return { table: "company", where: "workspace_id = $1", params: [workspaceId] };
}

/**
 * One user's connections in one workspace. `credentials` (encrypted upstream tokens) is left
 * out, so it never reaches a browser.
 */
export function connectionsSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "connection",
    where: "workspace_id = $1 AND user_id = $2",
    params: [workspaceId, userId],
    columns: ["id", "workspace_id", "user_id", "integration", "access", "created_at", "updated_at"],
  };
}

/** Custom connectors of one workspace. */
export function customConnectorsSync(workspaceId: string): SyncSpec {
  return {
    table: "custom_connector",
    where: "workspace_id = $1",
    params: [workspaceId],
    columns: ["id", "workspace_id", "key", "name", "mcp_url", "added_by_id", "created_at"],
  };
}

/**
 * Skills of one workspace, without `files`: a skill's extra files can reach 1 MB, so they load
 * on demand when someone opens the skill.
 */
export function skillsSync(workspaceId: string): SyncSpec {
  return {
    table: "skill",
    where: "workspace_id = $1",
    params: [workspaceId],
    columns: [
      "id",
      "workspace_id",
      "name",
      "description",
      "content",
      "source",
      "source_id",
      "enabled",
      "added_by_id",
      "created_at",
      "updated_at",
    ],
  };
}

/**
 * The copied memory facts of one workspace: its own and every company's (ADR 0017). Only what
 * ⌘K shows and ranks; `synced_at` stays on the server.
 */
export function memoryFactsSync(workspaceId: string): SyncSpec {
  return {
    table: "memory_fact",
    where: "workspace_id = $1",
    params: [workspaceId],
    columns: ["id", "workspace_id", "company_id", "text", "is_static", "created_at"],
  };
}

/**
 * The chats a user may see in one workspace (ADR 0018): every shared chat, and their own private
 * ones. `session_id` stays on the server: only the agent proxy needs it.
 */
export function chatsSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "chat",
    where: "workspace_id = $1 AND (space_id IS NOT NULL OR created_by_id = $2)",
    params: [workspaceId, userId],
    columns: [
      "id",
      "workspace_id",
      "space_id",
      "created_by_id",
      "title",
      "created_at",
      "updated_at",
      "last_message_at",
    ],
  };
}

/** Chat spaces of one workspace; every member sees every space. */
export function chatSpacesSync(workspaceId: string): SyncSpec {
  return { table: "chat_space", where: "workspace_id = $1", params: [workspaceId] };
}

/** One user's sidebar row (pins and folders) in one workspace. */
export function sidebarSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "sidebar",
    where: "workspace_id = $1 AND user_id = $2",
    params: [workspaceId, userId],
  };
}
