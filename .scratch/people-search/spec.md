# People search and enrichment through treg

Status: built 2026-11-27 (ADR 0027); ticket 09 (PostHog, reconciliation) skipped
Source: https://treg.to/people-search, https://treg.to/llms.txt, https://github.com/superdesigndev/treg

## Goal

Members find people and their contact data from two places:

1. **Chats.** "Find the heads of finance at Series B fintechs in London", "get Sarah's email",
   "who else works at acme.com?". The agent searches, shows the people as a table, and the
   member adds the ones they want to the CRM.
2. **Record create.** A new contact gets a verified work email, a phone number, LinkedIn and
   title. A new company gets industry, size, founded year and
   LinkedIn. This extends ADR 0025 ("records fill themselves").

Every paid call is recorded per workspace, so we can bill each customer later. The cost of
each call shows in the chat, as the turn time and step count do now.

All calls go through one treg team (ours). Workspaces do not add provider keys. treg's own
provider accounts serve every call, and treg bills our prepaid balance.

## What treg is

treg is "OpenRouter for agent tools": one token, one base URL, 4,200+ endpoints from 140
providers. It is open source (Python/FastAPI, Apache 2.0; we may use it internally and
self-host it, but not resell it as a hosted registry).

The part we use is its **routed contracts** (`src/treg/catalog/contracts.yaml`). Each
contract is one job with one input and output shape. treg runs a waterfall behind it: the
team's own keys first, then the cheapest provider per hit. It skips failures and charges only
for hits.

| Contract | Input (any one identity) | Output | Price seen |
| --- | --- | --- | --- |
| `treg.people.search` | `q` / `company_domain` / `title` (+ `company_domain`) / `full_name`; filters `country`, `location`, `keywords`, `limit`, `cursor` | `people[]` rows: name, title, company, company_domain, location, profile_url, email, email_status, summary, title_match | per row |
| `treg.people.email.find` | `full_name`+`domain`, `first_name`+`last_name`+`domain`, `linkedin_url` | email, confidence, verified; `_treg.domain_match` | $0.00095–$0.22 per hit, 33 providers |
| `treg.people.email.verify` | `email` | valid, status (valid, invalid, catch_all, risky, unknown) | ~$0.004 |
| `treg.people.phone.find` | `linkedin_url`, `email`, name+domain | phone (E.164), line_type, country_code | dearer; always unverified |
| `treg.people.enrich` | `email`, `linkedin_url`, name+domain | full_name, title, company, company_domain, linkedin_url, location | per hit |
| `treg.companies.enrich` | `domain`, `website`, `name`, `linkedin_url`, `email` | name, domain, description, industry, employees, founded, location, linkedin_url | per hit |
| `treg.companies.search` / `treg.companies.similar` | `q`, `industry`, `technology`, `domain` | companies[] (provider-native rows) | per row |
| `treg.linkedin.user.profile` | `linkedin_url` | headline, location, about, followers | per hit |

Call: `POST {TREG_URL}/call/<id>` with `X-Treg-Token`. The answer is `{output, raw, _treg}`.
Useful headers:

- Request: `X-Treg-Meta: workspace=<id>,user=<id>,...` (attribution, at most 5 pairs),
  `X-Treg-Route-Verify: true` (verify the hit in the same call),
  `X-Treg-Route-Domain-Match: strict`, `Idempotency-Key`.
- Response: `X-Treg-Cost-Micro`, `X-Treg-Call-Id`, `X-Treg-Served-By`, `X-Treg-Route-Outcome`.

**Second smoke test.** `linkedin.user.profile` for the same person: served by Bright Data
for $0.0015. `raw.avatar` holds the profile photo (a `media.licdn.com` 200×200 URL).

**Photo trial on the workspace's 4 contacts (2026-11-27, $0.085 in total).** None of them had a
LinkedIn URL. `people.enrich` from the email (Ocean.io, $0.0081 each) found all 4 LinkedIn URLs
and titles. Then `linkedin.user.profile`:

| Contact | Served by | Cost | Photo |
| --- | --- | --- | --- |
| Nate DaPore | Bright Data | $0.0015 | `raw.avatar`, media.licdn.com JPEG |
| Varun Sridhar | Bright Data | $0.0015 | `raw.avatar`, media.licdn.com JPEG |
| Nathan Owen | Bright Data | $0.0015 | LinkedIn's blank default avatar (static.licdn.com SVG), so context.dev was used: media.brand.dev PNG |
| Joaquin Lopez May | Fiber AI (Bright Data missed) | $0.047 | `raw.profile_pic`, img.imagecdn.dev JPEG |

What this changes:

- Read these photo keys: `avatar`, `profile_pic`, `profile_pic_url`, `profile_picture`,
  `photo_url`.
- Reject LinkedIn's default avatar: accept only raster images (the existing `sniffImageType`
  already drops SVG). Hosts allowed for the copy: media.licdn.com, img.imagecdn.dev and
  media.brand.dev.
- **Photos are kept at full size.** The context.dev photo was a 4.9 MB PNG, and the old 1 MB
  cap dropped it without a sign. Contact photos now have their own limits in `ImageCache`: 30 MB
  and a 20 s download (done 2026-11-27). There is no resize.
- Fiber AI costs 30× more than Bright Data for a profile. If only the photo is wanted, try
  context.dev first when Bright Data misses, or send `X-Treg-Route-Prefer: brightdata`.
- The 4 photos are now on the contacts (copied to local storage under
  `contacts/<id>/photo`). Titles and LinkedIn URLs were found but not written.

**Smoke test (2026-11-27, team `trycomp`).** `people.email.find` {Patrick Collison, stripe.com}
with Verify returned `patrick@stripe.com`, verdict `valid`. It cost $0.00495: $0.00095 find plus
$0.004 BounceBan check. `_treg.dropped` lists the 15 providers skipped because they need a
LinkedIn URL. The token is in `apps/api/.env` as `TREG_TOKEN`.

treg's integration rules, which this plan follows:

- All calls go through **one backend function**. It adds the attribution tag. The model never
  sets it.
- Store `X-Treg-Call-Id` with each usage record.
- Never forward treg's 402 or 429 bodies to users.
- Use an `Idempotency-Key` on retries. (treg's per-tag budgets come later, with spend limits.)
- Verify an email before anyone sends to it. One team bounced 73 of 79 unverified Hunter rows.

## Decisions (agreed 2026-11-27; ADR 0026)

1. **treg is the only enrichment backend.** We do not write Hunter, LeadMagic or Apollo
   clients. treg already normalises 33 email finders and 20+ search providers and runs the
   waterfall. `TREG_URL` keeps self-hosting open.
2. **Provider calls are thin CRM tools; the agent decides.** The API holds the token, the
   ledger and the cache. It relays one contract per tool and never chooses what a result
   means. This keeps the agentic-first rule: decisions stay in eve skills. The tools go on the
   gateway as `crm__*` tools (AGENTS.md: "add new CRM capabilities there").
3. **No permission or spend rules yet.** The tools are `readOnly: true`, so they run without
   asking in every permission mode, as `lookup_person` does today. We add no cost-based
   approvals and no spending limits in v1. Both come later and read the same ledger.
4. **One treg team; attribution per workspace.** Every call is tagged `workspace=<id>`.
5. **No workspace keys.** Members never add Hunter, LeadMagic or other provider keys. Every call
   uses treg's provider accounts. There is no Data providers settings page.
6. **The usage ledger is ours.** Every paid call writes one `usage_event` row: cost from treg,
   and price after our markup. Billing, the Usage page and the chat cost labels all read it.
7. **Facts come from treg; photos come from two sources.** The agent tool `crm__lookup_person`
   goes, and `enrich_person` replaces it for facts. Every contact still gets a photo:
   - **First, treg's LinkedIn profile.** `treg.linkedin.user.profile` returns the photo in
     `raw` (Bright Data: `avatar`, a `media.licdn.com` URL). We call it anyway for headline and
     location, and it cost $0.0015 in the smoke test. The field name differs per provider, so
     the client reads a known list (`avatar`, `profile_pic`, `profile_pic_url`,
     `profile_picture`, `photo_url`). These are signed URLs that expire, so the API **copies** the image into
     our storage at once (`users`-style key `contacts/<id>/photo`). It never hotlinks.
   - **Then context.dev.** When there is no LinkedIn URL or no photo, the API asks context.dev
     people enrich for the photo only (`WebReader.findPerson`, which stays as a server-side
     photo source, not an agent tool).
   - `PERSON_PHOTO_PATTERN` allows `media.licdn.com` next to context.dev's media host. Only
     PNG, JPEG, GIF and WebP are kept, as now. `media.licdn.com` does not go in the desktop
     CSP, because we only show copies.
8. **Email and phone become fact fields, gated by verification.** `factOutcome` scores:
   - an email by its verify verdict: `valid` is 0.95 and applies; `catch_all`, `risky` and
     `unknown` are 0.5, kept as a fact for review and never applied; `invalid` is dropped;
   - a phone at 0.55 unless a live-line check and a person match both pass. A wrong-person
     number does more harm than no number.
9. **We cache before treg's cache.** Redis read-through on (contract, normalised identity),
   30-day TTL, scoped per workspace. A second ask is free and instant (treg charges 10% for its
   own cache hits).

## Architecture

```
chat / research (eve, apps/agent)
   │  connections__crm__find_people, find_email, ...   (MCP, crm1. token)
   ▼
/api/mcp gateway ─► crm-tools: enrichment-tools.ts      (thin; Schema in/out)
                       │
                       ▼
                  Enrichment service (apps/api)          cache ► treg ► ledger
                       │  @crm/core/enrichment  createTreg({url, token, fetch})
                       ▼
                  treg.to/call/<contract>                waterfall: cheapest provider per hit
```

- **`@crm/core/enrichment`** (new, server-only subpath): `createTreg` is the single wrapper.
  - It builds the headers (meta, verify, idempotency key).
  - It decodes `{output, _treg}` with `Schema` per contract.
  - It returns `{output, costMicro, callId, servedBy, outcome, verification}`.
  - Typed failures: `InsufficientBalance`, `RateLimited`, `InvalidIdentity`, `Upstream`.
  - It takes `fetch` by injection, and its tests use recorded fixtures. No env reads.
- **`Enrichment` service** (apps/api, Effect layer):
  - `TREG_TOKEN`/`TREG_URL` are optional config. Without them the tools are not listed, as
    with `web` today.
  - Cache: Redis `crm:enrich:<workspace>:<contract>:<hash>`.
  - Writes `usage_event` rows.
- **`usage_event` table** (Prisma migration). This is the billing ledger (see "Usage and
  billing"):
  - columns: id (`use_`), workspaceId, userId, chatId?, turnId?, toolCallId?, operationId?,
    recordKind?, recordId?, kind (`enrichment`; later `model`), contract, servedBy,
    outcome (hit, miss, error, cached), costMicro, priceMicro, tregCallId (unique),
    createdAt;
  - no found values (those land on the record or a `contact_fact`);
  - it syncs per workspace with a column list (no tregCallId, no servedBy), so chats and
    settings read costs locally.
- **Tools** (`apps/api/src/services/enrichment-tools.ts`, merged into `crmTools.forCaller`).
  All are `readOnly: true`:
  - `find_people` (people.search; returns compact rows and a `resultId`)
  - `find_email` (email.find with Verify always on)
  - `verify_email`
  - `find_phone` (phone.find with the HLR check)
  - `enrich_person`
  - `enrich_company`
  - `find_companies`
  - `similar_companies`
  - `linkedin_profile` (also returns `photoUrl`, read from `raw`)
- **Record fields** (`@crm/core/records`, migration):
  - contact: `email_status` (valid, catch_all, risky, invalid, unknown), `email_verified_at`,
    `phone_type` (mobile, work, other);
  - company: `employee_count` (text range), `founded_year`;
  - `RECORD_SOURCES` += `search`;
  - `CONTACT_FACT_FIELDS` += `email`, `phone`; `COMPANY` fact path for the new fields;
  - the `contact_fact.evidence` jsonb carries `{tregCallId, verdict, lineType}`. It does not
    name the vendor in UI copy (agent rule).
- **Agent** (apps/agent):
  - `skills/research-contact.md`:
    - if there is no email, call `find_email` (name + company domain, else LinkedIn);
    - apply the email only through `record_contact_fact`;
    - if there is no LinkedIn or title, call `enrich_person`;
    - with a LinkedIn URL, call `linkedin_profile` and record its photo as an `image_url` fact
      (the API copies it; context.dev is the fallback);
    - if there is no phone, call `find_phone` (LinkedIn first, else email) and apply it
      through `record_contact_fact`.
  - `skills/research-company.md`: `enrich_company` for industry, headcount, founded year and
    LinkedIn.
  - New `skills/find-people.md` for chats:
    - turn the brief into `q`, `title`, `company_domain`, `location` and `keywords`;
    - ask for about 1.5× the rows the member wants;
    - check each row's `summary` against the brief;
    - never claim an email works until it is verified.
  - `instructions.md`: never name the vendor; never offer outreach to unverified emails.
- **Chat UI** (`@crm/ui/components/ai-elements` + `apps/web/src/components/chat`):
  - A `find_people` result renders a **People results** part: a compact table with
    initials-only avatars (no hotlinked photos), name, title, company, location and an email
    status chip.
  - It has row checkboxes (x and j/k, as in list keys) and two actions:
    - **Add to CRM** makes contacts optimistically through the synced collection with
      `source: "search"`, links or creates the company by domain, and research then starts by
      itself (ADR 0025);
    - **Find emails** asks the agent with the selected rows.
  - Rows already in the CRM (email or LinkedIn match against synced contacts) show "In CRM"
    and open the record sheet.
- **Record sheets:**
  - the contact `…` menu gets Find email, Verify email and Find phone; the company menu gets
    Find people here;
  - each item starts a short Auto agent run on that record, as "Fill the rest" does;
  - the email field shows a Verified, Catch-all or Unverified badge from `email_status`.
- **⌘K:** a "Find people…" action opens a new chat with the query.

## Usage and billing (per customer)

The customer is the **workspace**. Every paid call is one `usage_event` row. That table is
what we bill from later. It is never rebuilt from logs.

- **Two amounts per row.** `costMicro` is what treg charged us (`X-Treg-Cost-Micro`; 0 for our
  cache hits and misses). `priceMicro` is what the customer pays: cost × the workspace's
  markup, or a price list per contract. The markup lives in a new `workspace_billing` row and
  is 0% for now. The price is fixed when the row is written, so a later markup change never
  rewrites history.
- **Idempotent.** `tregCallId` is unique, and a retried call with the same `Idempotency-Key`
  does not write a second row.
- **Attribution is server-side.** The single treg wrapper sets
  `X-Treg-Meta: workspace=<id>,user=<id>,op=<chat|research|sheet>`. The model and the browser
  never set it.
- **Model usage later uses the same table.** Chat and research turns can add `kind: model` rows
  from the AI Gateway's cost per generation. Then one invoice covers enrichment and agent use.
  (Out of scope for v1, but the schema allows it.)
- **Usage page.** Workspace settings → Usage (`/settings/usage`) shows this month by day, by
  member, by kind (chat, research, sheet action) and by contract. Admins see cost and price;
  members see price. It has a CSV export (`GET /api/usage/export?month=YYYY-MM`) as the billing
  hand-off. When we add Stripe metered billing, a job pushes monthly `priceMicro` sums per
  workspace as meter events.
- **Reconciliation.** Every day, treg `GET /orgs/<org>/usage/by-tag?key=workspace` must equal
  `sum(costMicro)` per workspace. Attributed plus unattributed must equal treg's total. A drift
  alerts in PostHog before any invoice goes out.

## Cost in the chat

Chats already show "Worked for 14s · 5 steps" under each turn (`turnSummaries` in
`apps/web/src/components/chat/chat-view.tsx`). Costs show the same way:

- **Per call.** Each paid tool step in `ToolCalls` shows its price at the end of the step
  line, for example "Found 18 people · $0.24" or "Verified email · <$0.01". A cache hit shows
  "Saved", and a miss shows "No charge". The amount comes from the tool result's
  `_meta["crm/usage"] = {usageId, priceMicro}`, which the enrichment tools return. The synced
  `usage_event` row backs it up after a reload.
- **Per turn.** The turn summary adds the sum: "Worked for 14s · 5 steps · $0.31". It is shown
  only when the sum is above zero.
- **Per chat.** The chat menu shows "Usage in this chat: $1.12". This is the sum of
  `usage_event` rows by `chatId`, from the synced collection.
- **Background research** shows its cost in the record's Agent tab
  (`components/records/agent-tab.tsx`) per run: "Filled 4 fields · $0.07".
- Prices format through one helper (`formatUsage` in `@crm/core/usage`): under 1¢ shows
  "<$0.01", and more shows 2 decimals.

## Errors

- Search is billed per row, so `limit` is the price. The tool caps `limit` at 50 per call;
  more rows need another call.
- A 402 (treg balance empty) or 429 returns a plain refusal to the agent ("People search is
  unavailable right now"). It is logged to PostHog. The treg body is never shown. Auto top-up
  is on in the treg dashboard.

## Out of scope (v1)

- Sending email or sequences.
- Ad-audience hashes.
- Social and SEO contracts.
- Per-workspace treg teams and workspace provider keys.
- Spending limits, per-call approvals and cost-based permission rules (later; they read
  `usage_event`).
- Bulk CSV enrichment. Later, this is the same tools driven by a schedule.

## Answers (2026-11-27)

1. One treg team. No workspace keys; everything goes through treg.
2. Phone numbers on create: yes, always.
3. Spending limits: none for now.
4. No permission rules for paid calls for now; they come later.
5. context.dev person lookup: retired as an agent tool; it stays as the photo fallback
   behind treg's LinkedIn photo.
6. Hosted treg.
