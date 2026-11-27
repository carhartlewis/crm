# 0027: Enrichment through treg, with a usage ledger

**Status:** accepted (2026-11). Amends [0025](0025-records-fill-themselves.md): people lookup,
email and phone facts, and photos. Amended by [0028](0028-shared-enrichment-cache.md): the cache
is shared by every workspace.

## Context

Records fill themselves (0025), but only from context.dev and the web: no work emails, no phone
numbers, no way to find people who aren't in the CRM yet. Data providers (Hunter, LeadMagic,
Apollo, People Data Labs and dozens more) each cover part of the market, with their own APIs,
prices and miss rates. treg (treg.to, open source) puts one token in front of about 140
providers. Its routed contracts (`people.search`, `people.email.find`, `people.email.verify`,
`people.phone.find`, `people.enrich`, `linkedin.user.profile`, `companies.enrich`,
`companies.search`, `companies.similar`) give one input and output shape each, try providers
cheapest first and charge only for hits. We also need to bill each customer for what they use
later, and members want to see what each lookup cost.

## Decision

- **treg is the only enrichment backend.** One treg team (ours), hosted. Workspaces add no
  provider keys; treg's own provider accounts serve every call and treg bills our prepaid
  balance. `TREG_TOKEN` and `TREG_URL` (self-hosting stays a URL change) are API config; without
  a token the tools are not listed.
- **One wrapper, thin tools, the agent decides.** `@crm/core/enrichment` (`createTreg`) is the
  only code that calls treg. It tags each call with its workspace, user, origin and record
  (`X-Treg-Meta`, set by the server, never the model), and decodes each answer with the
  contract's `Schema`. The API's `Enrichment` service adds membership checks, a Redis cache
  (found answers 30 days, misses 7, per workspace) and the ledger. The agent reaches it through
  `crm__find_people`, `find_email`, `verify_email`, `find_phone`, `enrich_person`,
  `linkedin_profile`, `find_photo`, `enrich_company`, `find_companies` and `similar_companies`.
  They read only, so they run in every permission mode. No spending limits or cost approvals yet.
- **The usage ledger is ours.** Every paid call (and every cache hit, at no charge) writes one
  `usage_event` row: workspace, member, origin (`chat`, `research`, `sheet`), job, outcome,
  `cost_micro` (what treg charged) and `price_micro` (what the workspace pays: cost plus
  `workspace_setting.usage_markup_bps`, 0 for now, fixed when the row is written). The provider's
  call id is unique, so a retry is counted once. Billing, the Usage page
  (`/settings/usage`, CSV at `GET /api/usage/export`) and a record's spend read it. The agent
  token carries origin and record (`o`, `r`) so calls are filed under them; they grant nothing.
- **Costs show where the work shows.** Each tool answer carries its `usage`; the chat shows the
  price at the end of the step line, adds it to the turn's "Worked for … · n steps · $x" line and
  shows the chat's total. A record's Agent tab shows what research on it has cost.
- **Email and phone are facts, scored by their check, not by the agent.** `crm__record_contact_fact`
  takes `email` and `phone`. An email's mailbox verdict (from the find that returned it, or a
  check the CRM runs) decides: `valid` fills the contact (0.95), `catch_all` fills an empty field
  (0.7), `risky` and `unknown` are not saved, `invalid` is refused. A phone's line check decides:
  a live line fills the contact (0.8), an unchecked one only an empty field (0.6), a dead one is
  refused. The contact keeps `email_status`, `email_verified_at`, `phone_status` and
  `phone_type`; the sheet shows "Verified", "Catch-all", "Mobile" and so on.
- **Photos: LinkedIn first, then context.dev.** `crm__lookup_person` is gone; `find_photo` reads
  the photo from treg's LinkedIn profile (Bright Data first), and falls back to context.dev people
  enrich. Photos are copied, full size up to 30 MB, from `media.licdn.com`, `img.imagecdn.dev` or
  `media.brand.dev` only; LinkedIn's blank default avatar is on another host, so it never counts.
- **Every record gets researched, and companies bring their people.** Company research also finds
  its key people (`find_people` by domain) and adds up to five as contacts (`source: search`),
  each of which is then researched. A sweep every 10 minutes starts research on any company or
  contact still `pending` 15 minutes after it was added (the agent was down, or the workspace was
  at its cap), once a day per record.
- **People search in chats.** A `find_people` result shows as a table; members pick rows and
  Add to CRM, or ask for their emails. ⌘K offers "Find people: <query>".

## Consequences

- New contacts gain a checked work email, a phone number, LinkedIn, title and photo, and new
  companies their headcount, founded year and key people, with no clicks. Members are not asked to
  confirm any of it.
- Every create now costs treg lookups as well as an agent run: a contact is typically
  $0.01–$0.10, a company with five people more. There is no cap beyond research's 30 runs per
  10 minutes per workspace; spending limits and cost-based permissions come later and read the
  same ledger.
- Provider data can be wrong (a directory row with another person's LinkedIn, a former employer's
  email). The agent checks employer and domain; facts keep their score, source and evidence.
- One treg team serves every workspace, so per-workspace provider keys are not possible without
  moving to a team per workspace.
