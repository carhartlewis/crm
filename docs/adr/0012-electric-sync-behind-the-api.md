# 0012: Electric sync behind the authenticated API

**Status:** accepted (2026-11).

## Context

CRM records (Companies first) must read, filter and sort locally, and writes must feel instant. ElectricSQL streams Postgres rows to TanStack DB collections as _shapes_. Electric itself has no user auth: anyone who can reach it with its secret can read any table.

## Decision

1. **Electric is never exposed.** It runs in `compose.yaml` on `127.0.0.1:53000` with `ELECTRIC_SECRET`. Browsers reach shapes only through the API proxy, `GET /api/shapes/<table>` (raw route in `apps/api/src/http/routes.ts`).
2. **Workspace-scoped shapes.** The proxy authenticates the better-auth session, then requires `?workspace=` to equal the session's active workspace and the user to be a member. It sets `table`, a parameterised `where` (`workspace_id = $1`, `params[1]`) and the secret itself, and forwards only Electric protocol params (`offset`, `handle`, `live`, `cursor`, …). The workspace in the URL keeps browser cache entries separate per workspace; responses are `Cache-Control: private` with `Vary: Cookie`.
3. **Client-generated ids.** The client creates each row with `crypto.randomUUID()` and inserts it optimistically; the API stores that id, so the optimistic row and the synced row share one key.
4. **txid handshake.** Each write (`POST`/`PATCH`/`DELETE /api/companies…`) checks membership, writes, and reads `pg_current_xact_id()::xid::text` in one Prisma transaction, and returns `{ txid }`. The client keeps optimistic state until that txid arrives in the shape stream; a typed error rolls it back. Every update writes `updated_at`, so even an empty patch produces a change carrying the txid.

## Consequences

Auth and row filtering stay server-side; adding a record type means a table with `workspace_id`, a proxy route with its fixed shape, and write endpoints returning txids. Shape columns reach the browser with table names, so CRM tables use snake_case columns. Code: `apps/api/src/http/sync-proxy.ts`, `apps/api/src/services/Companies.ts`, `@crm/core/api` (`CompaniesApi`, `Company`), `@crm/core/company`.

## Addendum: connections, custom connectors and skills (2026-11)

- **They sync too.** `GET /api/shapes/connections`, `/api/shapes/custom-connectors` and `/api/shapes/skills` follow the same rules (session, `?workspace=`, membership). The Connections and Workspace Skills settings pages read them with `useLiveSuspenseQuery`; each route loader waits for its first snapshot. The catalog is built in the browser from `@crm/integrations` plus the synced custom connectors. Only third-party data stays on TanStack Query: logos, skills.sh search, and each app's OAuth start.
- **A shape can fix its columns.** `connection` syncs only the caller's rows (`workspace_id = $1 AND user_id = $2`) and never `credentials`; `skill` leaves out `files` (up to 1 MB per skill), which the skill sheet loads on demand from `GET /api/skills/:id`. A client's `columns` param is ignored.
- **Writes return txids.** Changing access, disconnecting, removing a connector, enabling or removing a skill are optimistic collection writes. Adding a connector (the API checks the server for MCP OAuth) and adding a skill (validated, or copied from skills.sh) are not: the mutation calls the API, then awaits the returned txid in the collection, so it settles once the new row has synced. A new connection is written by the app's OAuth callback and simply arrives through sync, including when sign-in finished in the system browser.
- **Replica identity.** Electric sets `REPLICA IDENTITY FULL` on a table the first time it serves a shape for it, so synced tables need no migration step for it.

Code: `apps/api/src/http/sync-proxy.ts` (`connectionsSync`, `customConnectorsSync`, `skillsSync`), `apps/api/src/services/txid.ts`, `apps/web/src/lib/sync-collections.ts`, `apps/web/src/lib/connections.ts`, `apps/web/src/lib/skills.ts`.
