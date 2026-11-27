# 0016: Prefixed record ids

**Status:** accepted (2026-11)

## Context

Record ids were bare UUIDs. In a URL (`?company=…`), a log line or a support message, nothing
said what an id was. comp-neo prefixes its ids (`pol_…`) and we want the same scheme.

## Decision

- **A record id is a registered prefix, `_`, then 24 random base62 characters**, such as
  `com_0123456789ABCDEFGHIJKLMN`, from `createId` in `@crm/core/ids` (client-safe; the browser
  makes ids for optimistic rows). Bytes are sampled without bias from `crypto.getRandomValues`.
- **One prefix per table, never reused:** `com` company, `ctc` contact, `wfk` workflow, `cnx`
  connection, `ccn` custom connector, `skl` skill. A test fails when a table in the Prisma
  contract has neither a prefix nor a listed exemption.
- **better-auth tables keep their own ids** (users, sessions, workspaces, members and the rest).
- **Older rows keep their UUIDs.** `isRecordId(prefix, value)` accepts a prefixed id of that kind
  or a lowercase UUID, so existing links and memory namespaces (keyed by company id) never move.
  No migration rewrites primary keys.

## Consequences

- Validation checks the kind: a `ctc_` id is refused where a company id is expected.
- Adding a table means adding its prefix (or exemption) to `ID_PREFIXES` / `ID_EXEMPTIONS`.
