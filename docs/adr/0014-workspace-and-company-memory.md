# 0014: Workspace and company memory in Supermemory, judged by Jev

**Status:** accepted (2026-11)

## Context

The assistant forgets everything between chats, and a CRM is mostly memory: what a customer
uses, who decides, what was promised. comp-neo (`trycompai/comp-neo`, ADR 0001 there) already
keeps workspace memory in Supermemory and uses Jev to decide what activity is worth keeping. We
want the same here, extended to every company in the CRM, and fed by website research, members'
notes, chats with the assistant and the emails members send.

## Decision

- **Supermemory stores sources and extracts facts.** `@crm/memory` holds the store interface
  (adapted from comp-neo's `@trycompai/memory`), the Supermemory v5 adapter, an in-memory fake for
  tests, Jev's questions and thresholds, and the recall format. One namespace per workspace
  (`<prefix>_ws_<workspace>`) and one per company under it (`…_co_<company>`). The prefix is a hash
  of the API's origin unless `MEMORY_NAMESPACE_PREFIX` is set, so environments can share an
  account. People get their own namespace when contacts become records.
- **The API owns the key and the access checks.** `apps/api`'s `Memory` service checks
  membership, picks the namespace and writes sources. Members use `/api/memory/*` (HttpApi group
  `memory`); the agent uses `/api/agent/memory/*` with its better-auth MCP token, which names the
  workspace (ADR 0013). Neither the browser nor the agent sees `SUPERMEMORY_API_KEY`. Without it
  memory is off: reads are empty and writes say why.
- **New workspaces and companies are researched.** After a workspace is created
  (better-auth `afterCreateOrganization`) and after a company is created or gets a domain, the
  API asks context.dev (`@crm/core/brand`, `research`) for the brand profile and the home page as
  Markdown, and stores them as one `website-research` source. Supermemory does the extraction; the
  API only collects public evidence. Research runs off the request path and replaces the earlier
  research when run again ("Research website").
- **Chats are memory; Jev decides what becomes a fact.** The agent's `crm` memory slot
  (`apps/agent/agent/memory/crm.ts`, an eve memory provider) recalls the member's own company and
  the companies a message names before each turn. After each turn it saves the whole chat as one
  source per session, then asks Jev (`typesafe-ai/jev` through the Vercel AI Gateway,
  `experimental_decide`) about each of the member's messages and each email they sent through a
  connected app: is it sensitive, is it lasting, which company is it about, is it already known,
  does it make a known fact out of date. Fixed thresholds decide. A kept note quotes the member's
  words with the date; a correction forgets the fact it replaces. This judgment is in the agent,
  not the API (agentic-first).
- **Emails are read from the agent's own tool calls.** A successful call to a connected app's send,
  reply or forward tool is an email candidate; its recipients' domains pick the company.
- **Members see and correct memory.** Workspace settings → Workspace Memory and each company's Knowledge
  tab draw the memory as Supermemory's graph (`@supermemory/memory-graph`, as in comp-neo):
  sources and the facts read from them, with search. Members add notes, research the website
  again, open a source and forget wrong facts. The agent has
  `crm__search`, `crm__remember` and `crm__forget` (forget asks first). Recalled text is data,
  never instructions.

## Alternatives

- **comp-neo's Postgres source ledger and fact mirror.** It gives retries and offline reads, but
  needs a job runner this repo does not have. Sources here have stable ids and replacing deletes
  first, so retries are safe; we add a ledger when we add background jobs.
- **Supermemory's eve provider in the agent.** Simpler, but it puts the key in the agent and skips
  the CRM's membership checks.
- **Judge in the API.** Faster to call, but intelligence belongs to the agent.

## Consequences

- Facts appear seconds to a minute after a source is saved; the UI polls while a source is
  processing.
- Website research, notes, chats and sent emails leave our infrastructure for Supermemory, and
  Jev sees members' messages and email bodies. Jev is told to ignore secrets and private personal
  data, but its judgment is a probability, not a guarantee.
- Emails sent outside the assistant (straight from Gmail) are not captured until mailbox sync
  exists. Contacts have no memory until they are records.
- Deleting a company deletes its namespace. Workspaces can't be deleted (ADR 0006).
