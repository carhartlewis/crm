# 0017: A synced copy of memory facts for ⌘K

**Status:** accepted (2026-11). Replaces the "fact mirror" alternative that
[0014](0014-workspace-and-company-memory.md) turned down.

## Context

⌘K searches companies locally, instantly, from synced collections. Facts live in Supermemory
(ADR 0014). Searching Supermemory on each keystroke adds a network round trip to an external
provider per query; a Redis cache would still be a round trip, and Redis has no text search.
Supermemory has no webhooks: its docs say to poll a source's status. It also revises facts on its
own after a source is read.

## Decision

- **Table `memory_fact`** holds a copy of each memory's facts, keyed by Supermemory's fact id (an
  id exemption, ADR 0016): workspace, company (null for the workspace's own memory), text,
  lasting or not, when Supermemory read it, when the API copied it. Deleting a workspace or a
  company deletes its rows.
- **It syncs like CRM records**: `/api/shapes/memory-facts`, one shape per workspace, without
  `synced_at`. ⌘K ranks facts with the same tiers as everything else (at most 8 among the
  results). A company's fact opens that company's sheet on its Knowledge tab; a workspace fact
  opens Workspace Memory.
- **The Memory service is the only writer, and refreshes on demand, with no job runner.**
  - A copy is fresh for 15 minutes (`memory:fresh:<namespace>` in Redis). While a source is still
    being read, the copy is not marked fresh, so the next look copies the facts that arrive.
  - Every write through the service (notes, research, the agent's facts, chats, deleted sources)
    marks its memory stale. A forgotten fact leaves the copy at once.
  - Reading a memory (Knowledge tab, Workspace Memory, the graph it polls) refreshes a stale copy
    off the request path.
  - Opening ⌘K calls `POST /api/memory/refresh`, which refreshes up to 8 stale copies of the
    workspace (its own first, then its companies'), two at a time, and returns at once.
- At most 500 facts per memory are copied, newest first.

## Consequences

- ⌘K finds facts by their words, not their meaning: "who signs off on budget" does not find
  "Dana approves spend". Semantic search stays in the memory pages and the agent.
- A fact Supermemory revises on its own reaches ⌘K the next time its memory is read or ⌘K
  refreshes it after 15 minutes. A workspace with many companies takes several ⌘K opens to copy
  them all.
- If background jobs arrive, a scheduled sweep can replace the on-demand refresh.
