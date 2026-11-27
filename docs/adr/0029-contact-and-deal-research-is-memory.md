# 0029: Contact and deal research is memory, and deals research themselves

**Status:** accepted (2026-11). Extends [0025](0025-records-fill-themselves.md) to deals and
[0014](0014-workspace-and-company-memory.md) and [0026](0026-research-is-the-graph-core.md) to
contacts and deals. Supersedes the per-workspace research cap of 0025.

## Context

A company's research reached memory as its `website-research` source (0014), and 0026 made that
source the core of its graph. A contact's research filled fields and a Background brief, but its
memory stayed empty until someone chatted about them. A new deal got no research and no memory.
The agent recalls and members read a record through its memory, so research that never reaches
memory is lost to both.

## Decision

- **A contact's brief is its research source.** When the agent calls `crm__write_contact_brief`
  and the brief is saved, the API also saves it as the contact's research source in memory:
  Markdown with the narrative and each section the brief has (`contactResearch` in
  `intel-tools.ts`). Writing the brief again replaces it. Memory being off never fails the brief.
- **Deals research themselves.** When a deal is created (by a member or the agent), `Research`
  starts a background Auto session about it (`research:<id>`). The
  agent follows its `research-deal` skill: it reads the deal, the company, its people and what the
  CRM remembers (including what the workspace sells), researches the buyer's situation that bears
  on the deal, and saves a brief with `crm__write_deal_brief`: narrative, why now, needs, buying
  group, competitors and current tools, risks, open questions, next steps and sources. It never
  changes the deal's stage, amount, close date or owner.
- **A deal brief lives only in memory.** `crm__write_deal_brief` writes the deal's research source
  through `Memory.agent.research`; there is no deal brief table. The deal's Knowledge tab shows it.
- **One research source per record, the graph's core.** Contact and deal research use the same
  stable source id as website research (`website-research`), so 0026's core rule applies without
  change, with a new source kind `research` ("Research" in the graph). Facts read from it are
  static, as website research's are. Companies and the workspace keep website research;
  `Memory.agent.research` refuses them.
- **No research cap.** 0025 let each workspace start 30 runs per 10 minutes. The number had no
  basis and silently left records unresearched, so it is gone: every created record, every sweep
  retry and every "Fill the rest" starts its session. The sweep still starts its retries one at a
  time.
- **No research state on deals.** Deals have no `enrichment_status`, so the sheet shows no
  "Researching" state and the sweep never retries a deal whose start was missed (the agent was
  down).

## Consequences

- Every new contact and deal gets memory within minutes, and the agent recalls it in later chats.
- Each new deal costs an agent run and any web lookups it makes. With no cap, a bulk import
  starts one run per record at once; the agent and its providers carry that load.
- A deal whose research did not start stays without a brief until a member asks for one. Add a
  research state to deals if that proves common.
- Contact and deal facts are still not copied to `memory_fact` (0017), so ⌘K doesn't list them.
