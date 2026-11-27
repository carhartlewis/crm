# Core enrichment treg client

Status: resolved
Type: task
Blocked by: 01
Spec: ../spec.md

New server-only subpath `@crm/core/enrichment`, with `createTreg({url, token, fetch})`.

- One `call(contract, identity, opts)` that sets `X-Treg-Meta` (workspace, user, chat or
  operation), `Idempotency-Key`, and `X-Treg-Route-Verify` when requested.
- A `Schema` for each contract's input and output (people.search, email.find, email.verify,
  phone.find, people.enrich, companies.enrich, companies.search, companies.similar,
  linkedin.user.profile). Mirror treg's `contracts.yaml`.
- Returns `{output, costMicro, callId, servedBy, outcome, verification}`. Typed failures:
  InsufficientBalance (402), RateLimited (429), InvalidIdentity (422), Upstream.
- bun:test with injected fetch and recorded fixtures (including the 2026-11-27 smoke-test
  response). Add a `check-types` script and register the export.

## Answer

`@crm/core/enrichment`: `createTreg`, per-contract `Schema` outputs (`CONTRACT_OUTPUTS`), `readTregAnswer` (also reads cached bodies), photo from the body, normalisers. Tests in `enrichment.test.ts`.
