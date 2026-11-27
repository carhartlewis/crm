# 0030: Research runs through a BullMQ queue with concurrency limits

**Status:** accepted (2026-11). Amends [0025](0025-records-fill-themselves.md) and
[0029](0029-contact-and-deal-research-is-memory.md): every record still gets research, but only a
limited number of sessions run at the same time.

## Context

0029 removed the per-workspace research cap because it silently left records without research.
After that, every created company, contact and deal started its agent session at once. One
company starts up to six sessions (the company and its people), so a bulk import of 50 companies
could start about 300 sessions together. The agent, the model gateway, treg and context.dev all
took that load at once, and a provider's rate limit made research end with fewer details.

The UI also showed "Researching" until a session marked its record, and a session that died kept
it there until the sweep, 30 minutes later.

## Decision

- **Every research session is a BullMQ job.** Record research (`research-<record id>`) and "Fill
  the rest" (`fill-<field id>-<minute>`) go on one BullMQ queue, `research`, with its keys under
  `crm:bull` (`research-bullmq.ts`). BullMQ connects through Bun's native `RedisClient` with its
  `createBunRedisClient` adapter, so the repository still has no other Redis client. A job for a
  record that is already waiting, delayed or running is not added again.
- **Limits are on concurrency, not on volume.** BullMQ's global concurrency
  (`RESEARCH_CONCURRENCY`, default 50) limits the sessions of all API instances together. A slot
  set per workspace (`crm:research:slots:<workspace>`, one Lua script) limits each workspace to
  `RESEARCH_WORKSPACE_CONCURRENCY` (default 10). Open-source BullMQ has no limit per group (that is
  in BullMQ Pro), so a job whose workspace is full goes back to BullMQ's delayed set for 5 seconds
  and tries again. Other workspaces' jobs run in the meantime. Nothing is dropped.
- **A job runs as long as its session.** The worker takes a slot, marks a company or contact
  `running`, starts the agent session, and waits for the session's end. BullMQ renews the job's
  lock while it waits. A job that BullMQ runs again after a restart keeps its own slot, and eve
  starts its session once for the same operation id.
- **The session's end frees its slot at once.** The API passes the job id to the agent
  (`x-crm-research-job`). When the turn settles, or pauses for an approval that nobody in a
  background session can give, the agent's `research-settle` hook calls
  `/api/agent/research/settle`. The API checks that the job holds a slot in the caller's
  workspace, wakes the waiting job (in process, or through a Redis mark for another instance), and
  closes a company or contact that the session left `pending` or `running`.
- **A lease covers sessions that die.** A job stops waiting after 30 minutes and frees its slot.
  The sweep still queues records left `pending` or stuck `running`; BullMQ ignores the ones it
  holds.
- **Postgres keeps the status; Electric shows it.** A company or contact is `pending` while it is
  queued (the optimistic row shows "Research queued" at once). The worker sets `running` when its
  session starts, and the session or the settle call sets `complete`, `skipped` or `failed`.
  Electric syncs each change to every open table and sheet. The Companies and Contacts headers
  count the synced rows ("Researching 4 · 12 queued"). The UI never polls the queue.

## Consequences

- A bulk import is researched in steps. Records waiting their turn show "Research queued".
- A workspace over its limit makes its waiting jobs cycle through BullMQ's delayed set every
  5 seconds. That costs a few Redis calls per job and a slot can wait up to 5 seconds for its next
  job.
- Deals and fills use slots but have no status column, so the headers do not count them.
- The queue rules (`runResearchJob`) are tested with in-memory slots and session ends. BullMQ and
  the Redis slots are not in CI, which has no Redis.
