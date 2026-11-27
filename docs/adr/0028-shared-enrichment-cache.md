# 0028: One enrichment cache for every workspace

**Status:** accepted (2026-11). Amends [0027](0027-enrichment-through-treg.md): the cache scope.

## Context

0027 cached treg answers per workspace, and context.dev answers were not cached at all. Records
fill themselves (0025), so when two workspaces add the same company or person, each one pays for
the same lookups: treg finds, context.dev `brand/retrieve` (10 credits), the home page scrape,
people enrich and logos. The answers are public provider data about the company or person. They
do not depend on the workspace that asks, and they carry nothing from it.

## Decision

- **Cache keys hold no workspace.** treg answers and their email and phone verdicts are keyed by
  the question only (`enrich:shared:*`). A second workspace that asks the same question gets the
  stored answer.
- **context.dev is cached too.** `createContextDev` takes a `cache` (`Kv`). Each request
  (method, URL, body) is one key (`brand:<sha256>`), so `research`, `lookup` and `iconUrls` share
  answers. Found answers stay 30 days, "not found" (400, 404, 422) 7 days, page scrapes 1 day.
  Auth errors, rate limits, outages and timeouts are not cached. When Redis fails, the client asks
  context.dev. The API builds one client (`Brand` service) for logos, research and agent tools.
- **What is cached is the provider's answer, never ours.** Facts the agent records, member edits,
  scores and memory stay in the workspace. The cache stores the raw answer, so it does not reveal
  which workspace asked, or what that workspace did with it.
- **A cache hit is free to the workspace.** Every hit still writes a `usage_event` row (outcome
  `cached`, cost and price 0), as in 0027.

## Consequences

- A company or person costs one paid lookup per TTL, across all workspaces.
- A workspace can learn that a provider has data on a person, as it could by paying for the
  lookup. It cannot learn that another workspace asked.
- A stale answer (a person changes jobs) lives up to 30 days for everyone. The agent checks
  employer and domain, as before.
- Old per-workspace keys are not read; they expire within 30 days.
