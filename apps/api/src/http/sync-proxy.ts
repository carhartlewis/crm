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

/** Contacts of one workspace. */
export function contactsSync(workspaceId: string): SyncSpec {
  return { table: "contact", where: "workspace_id = $1", params: [workspaceId] };
}

/** Deals of one workspace. */
export function dealsSync(workspaceId: string): SyncSpec {
  return { table: "deal", where: "workspace_id = $1", params: [workspaceId] };
}

/** Who is on each deal in one workspace (the row carries its workspace, so no join). */
export function dealContactsSync(workspaceId: string): SyncSpec {
  return { table: "deal_contact", where: "workspace_id = $1", params: [workspaceId] };
}

/** Activity of one workspace: notes, calls, emails, meetings, tasks and stage changes. */
export function activitiesSync(workspaceId: string): SyncSpec {
  return { table: "activity", where: "workspace_id = $1", params: [workspaceId] };
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
 * The chats a user may see in one workspace (ADR 0020): the ones they started, and the ones in
 * spaces they joined. Joining or leaving moves chats in or out of the shape. `session_id` stays
 * on the server: only the agent proxy needs it.
 */
export function chatsSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "chat",
    where:
      "workspace_id = $1 AND (created_by_id = $2 OR space_id IN (SELECT space_id FROM chat_space_member WHERE user_id = $2))",
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
      "permission_mode",
      "record_kind",
      "record_id",
    ],
  };
}

/** Chat spaces of one workspace; every member sees every space. */
export function chatSpacesSync(workspaceId: string): SyncSpec {
  return { table: "chat_space", where: "workspace_id = $1", params: [workspaceId] };
}

/** Who joined each space of one workspace (ADR 0020). */
export function chatSpaceMembersSync(workspaceId: string): SyncSpec {
  return { table: "chat_space_member", where: "workspace_id = $1", params: [workspaceId] };
}

/** One user's sidebar row (pins and folders) in one workspace. */
export function sidebarSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "sidebar",
    where: "workspace_id = $1 AND user_id = $2",
    params: [workspaceId, userId],
  };
}

/** Custom field definitions of one workspace, archived ones included (settings restore them). */
export function fieldDefinitionsSync(workspaceId: string): SyncSpec {
  return { table: "field_definition", where: "workspace_id = $1", params: [workspaceId] };
}

/** The options of one workspace's select fields. */
export function fieldOptionsSync(workspaceId: string): SyncSpec {
  return { table: "field_option", where: "workspace_id = $1", params: [workspaceId] };
}

/** Custom field values of one workspace's companies, contacts and deals. */
export function fieldValuesSync(workspaceId: string): SyncSpec {
  return { table: "field_value", where: "workspace_id = $1", params: [workspaceId] };
}

/** The agent's proposed facts on the contacts of one workspace (ADR 0024). */
export function contactFactsSync(workspaceId: string): SyncSpec {
  return { table: "contact_fact", where: "workspace_id = $1", params: [workspaceId] };
}

/** The agent's briefs on the contacts of one workspace (ADR 0024). */
export function contactBriefsSync(workspaceId: string): SyncSpec {
  return { table: "contact_brief", where: "workspace_id = $1", params: [workspaceId] };
}

/**
 * One workspace's settings row: its reporting currency (ADR 0024). The tracking key is left to
 * the tracking screen.
 */
export function workspaceSettingsSync(workspaceId: string): SyncSpec {
  return {
    table: "workspace_setting",
    where: "workspace_id = $1",
    params: [workspaceId],
    columns: ["workspace_id", "reporting_currency", "usage_markup_bps", "updated_at"],
  };
}

/**
 * One workspace's paid lookups (ADR 0027): what each cost the workspace, without what it cost us
 * or the provider's call id.
 */
export function usageSync(workspaceId: string): SyncSpec {
  return {
    table: "usage_event",
    where: "workspace_id = $1",
    params: [workspaceId],
    columns: [
      "id",
      "workspace_id",
      "user_id",
      "origin",
      "contract",
      "outcome",
      "price_micro",
      "record_kind",
      "record_id",
      "created_at",
    ],
  };
}

/**
 * What each of one workspace's lookups cost us: rows only when the caller is one of its owners or
 * admins (the subquery), so members never see our cost.
 */
export function usageCostsSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "usage_event",
    where:
      'workspace_id = $1 AND workspace_id IN (SELECT "organizationId" FROM "member" WHERE "userId" = $2 AND role IN (\'owner\', \'admin\'))',
    params: [workspaceId, userId],
    columns: ["id", "workspace_id", "cost_micro"],
  };
}

/** Exchange rates: the fetched ones every workspace shares, plus one workspace's own. */
export function exchangeRatesSync(workspaceId: string): SyncSpec {
  return {
    table: "exchange_rate",
    where: "workspace_id IS NULL OR workspace_id = $1",
    params: [workspaceId],
  };
}

/** One workspace's shared views and one user's own. */
export function savedViewsSync(workspaceId: string, userId: string): SyncSpec {
  return {
    table: "saved_view",
    where: "workspace_id = $1 AND (shared = true OR owner_id = $2)",
    params: [workspaceId, userId],
  };
}
