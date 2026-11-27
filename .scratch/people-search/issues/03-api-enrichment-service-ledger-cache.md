# Api enrichment service ledger cache

Status: resolved
Type: task
Blocked by: 02
Spec: ../spec.md

`Enrichment` Effect service in apps/api: cache, then treg, then the ledger. No budgets or limits.

- Config: optional `TREG_TOKEN` (Redacted) and `TREG_URL` (already in `.env.example`).
- Prisma migration: `usage_event` (the billing ledger; see spec "Usage and billing") with id
  prefix `use_`, `tregCallId` unique, and both `costMicro` and `priceMicro`. Add
  `workspace_billing` (markup in basis points, default 0). Add an Electric shape per workspace
  with a column list (no tregCallId, no servedBy) and add it to `syncedRecords`.
- Every paid tool returns `_meta["crm/usage"] = {usageId, priceMicro}`.
- Redis cache `crm:enrich:<workspace>:<contract>:<sha256(normalised identity)>`, 30-day TTL.
  A cache hit logs `outcome: cached` at 0 cost.
- Tests: createMemoryKv with a clock, a fake treg.

## Answer

`Enrichment` service (membership, Redis cache, ledger), `usage_event` table + `usage_markup_bps` (migration `20261127T0532_enrichment_usage`), origin and record carried in the agent token. Tests in `enrichment.test.ts`. (A later session made the cache shared across workspaces, ADR 0028.)
