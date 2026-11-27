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
