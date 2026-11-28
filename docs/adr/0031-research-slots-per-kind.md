# 0031: Each kind of research has its own slots

**Status:** accepted (2026-11). Amends [0030](0030-research-queue.md): the limit per workspace is
now a limit per workspace for each kind of job.

## Context

0030 gave each workspace one set of 10 slots for every kind of research. One company starts up to
six sessions (the company and its people), and a contact import starts one per person. So a bulk
import of contacts or companies filled every slot, and a company, deal or "Fill the rest" that a
member made after it waited behind the whole import.

## Decision

- **One slot set per workspace and kind.** Companies, contacts, deals and fills each have their
  own Redis sorted set (`crm:research:slots:<workspace>:<kind>`) and their own limit:
  `RESEARCH_COMPANY_CONCURRENCY` (default 25), `RESEARCH_CONTACT_CONCURRENCY` (10),
  `RESEARCH_DEAL_CONCURRENCY` (2) and `RESEARCH_FILL_CONCURRENCY` (2).
  `RESEARCH_WORKSPACE_CONCURRENCY` is gone.
- **One BullMQ queue still holds every job.** A job whose kind is full goes back to the delayed
  set for 5 seconds, as in 0030. Jobs of other kinds run in the meantime. The global limit
  (`RESEARCH_CONCURRENCY`) goes from 50 to 1000, so the limits per workspace and kind are what
  hold research back.
- **A session's end finds its slot without its kind.** The settle call sends only the job id, so
  the API checks the workspace's sets for every kind.

## Consequences

- A workspace can run up to 39 sessions at once by default, not 10. Contacts get the most
  slots: one company starts up to five contact sessions.
- A bulk import of one kind no longer holds up new records of another kind. Records of the same
  kind still wait their turn.
- Slots held under the old key (`crm:research:slots:<workspace>`) when this ships are not found by
  the settle call. Those jobs end at their 30-minute lease, and the old keys expire with it.
