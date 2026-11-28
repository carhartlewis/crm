---
description: Use before your first call to any connections__crm__ tool in a chat. It gives each CRM tool's exact name and parameter names, and the mistakes that make calls fail.
---

# Call CRM tools without errors

The CRM tools are not in your tool list. Call each one with
`eve__tool({ name: "connections__crm__<tool>", input: { … } })`. `input` is a JSON object, never a
string, and `name` stays outside `input`.

## Rules

- Use the parameter names below exactly. A name the tool doesn't take is dropped, so the call
  fails as if you left it out. Never guess `contactId`, `fullName`, `company_domain` or
  `factType` from another tool.
- The names are not consistent between tools. Check each one:
  - Reads take the record as `id`: `get_contact({ id })`, never `contactId`.
  - List and memory filters are camelCase: `companyId`, `contactId`, `dealId`.
  - Writes and research tools are snake_case: `contact_id`, `company_id`, `deal_id`.
  - `find_people` takes `company_domain`; every other people tool takes `domain`.
- `domain` is a bare domain such as `acme.com`, never a company name or a URL with a path. When you
  have only the name, read the company (`get_company`) for its domain first.
- A people lookup needs one of: `email`, `linkedin_url` (a `linkedin.com/in/…` profile URL), or
  `full_name` together with `domain`. A name alone always fails. Check you have one before you call.
- When a call fails, read the error. It names the parameters the tool takes. Fix the input once;
  never send the same input again. If it fails twice, go on without that tool.
- "That address bounces; it was not saved" and "dead line" are answers, not errors: the CRM checked
  the value and refused it. Don't record it again, and don't say you saved it.
- In `record_contact_fact`, `field` is one of `email`, `phone`, `title`, `image_url`, `seniority`,
  `function`, `linkedin_url`, `twitter_url`, `github_url`. Record one field per call. `evidence` is
  a list of short quotes, such as `["CEO & Co-founder"]`. `score` is required.
- Don't record an `email` whose `find_email` status is `invalid`, or one whose `sameDomain` is
  false. Don't record a `phone` whose `find_phone` status is `dead`.

## Signatures

`?` marks an optional parameter. `R` reads; `W` changes the CRM.

```text
R connections__crm__lookup_company(domain?, name?, email?)
R connections__crm__read_web_page(url)
R connections__crm__find_people(q?, company_domain?, title?, full_name?, country?, location?, keywords?, limit?, cursor?)
R connections__crm__find_email(full_name?, domain?, linkedin_url?)
R connections__crm__verify_email(email)
R connections__crm__find_phone(email?, linkedin_url?, full_name?, domain?)
R connections__crm__enrich_person(email?, linkedin_url?, full_name?, domain?)
R connections__crm__linkedin_profile(linkedin_url)
R connections__crm__find_photo(email?, linkedin_url?, full_name?, domain?)
R connections__crm__enrich_company(domain?, name?, linkedin_url?)
R connections__crm__find_companies(q?, name?, industry?, technology?, domain?, country?, limit?)
R connections__crm__similar_companies(domain)
R connections__crm__list_companies(query?, limit?)
R connections__crm__get_company(id)
W connections__crm__create_company(name, domain?)
W connections__crm__update_company(id, name?, domain?, website?, description?, industry?, employee_count?, founded_year?, city?, country?, phone?, email?, linkedin_url?, twitter_url?, github_url?, owner_id?, primary_contact_id?, archived?)
R connections__crm__list_contacts(query?, companyId?, dealId?, limit?)
R connections__crm__get_contact(id)
W connections__crm__create_contact(first_name, last_name?, title?, email?, phone?, linkedin_url?, company_id, found_by_search?)
W connections__crm__update_contact(id, first_name?, last_name?, title?, email?, phone?, linkedin_url?, twitter_url?, github_url?, seniority?, function?, company_id?, owner_id?, archived?)
R connections__crm__list_deals(query?, companyId?, contactId?, stage?, limit?)
R connections__crm__get_deal(id)
W connections__crm__create_deal(name, company_id, stage?, amount?, currency?, expected_close_date?)
W connections__crm__update_deal(id, name?, stage?, closed_reason?, amount?, currency?, expected_close_date?, description?, owner_id?, archived?)
W connections__crm__add_deal_contact(deal_id, contact_id, role?)
W connections__crm__log_activity(type, subject?, body?, due_at?, company_id?, contact_id?, deal_id?)
R connections__crm__list_members()
R connections__crm__search_memory(query, companyId?, contactId?, dealId?)
W connections__crm__remember(text, companyId?, contactId?, dealId?, replaces?)
W connections__crm__forget(factId, companyId?, contactId?, dealId?)
W connections__crm__set_enrichment_status(kind, id, status, error?)
W connections__crm__record_contact_fact(contact_id, field, value, score, band?, evidence?, source_url?, phone_type?)
W connections__crm__write_contact_brief(contact_id, narrative, current_role?, tenure?, previous_roles?, seniority?, function?, location?, source_url?)
W connections__crm__write_deal_brief(deal_id, narrative, why_now?, needs?, buying_group?, competitors?, risks?, open_questions?, next_steps?, sources?)
W connections__crm__log_email(thread_id, subject, summary?, occurred_at, messages?, last_reply_at?, contact_id?, company_id?, deal_id?, external_url?)
W connections__crm__log_meeting(event_id, subject, summary?, occurred_at, duration_minutes?, attendees?, contact_id?, company_id?, deal_id?, external_url?)
R connections__crm__list_fields(entity, record_id?)
W connections__crm__set_field_value(entity?, field, record_id, value, replace_member_value?)
```

For a parameter's allowed values (a stage, an activity type, a status), call `eve__search` with the
tool's full name. Its result gives the full signature with descriptions.

## Examples

```json
{ "name": "connections__crm__get_contact", "input": { "id": "ctc_…" } }
{ "name": "connections__crm__enrich_person", "input": { "full_name": "Scott Bujeya", "domain": "arthur.health" } }
{ "name": "connections__crm__find_email", "input": { "full_name": "Camila Noordeloos", "domain": "grandvcp.com" } }
{ "name": "connections__crm__record_contact_fact", "input": { "contact_id": "ctc_…", "field": "title", "value": "General Partner", "score": 0.9, "source_url": "https://grandvcp.com/the-team", "evidence": ["James Hill, General Partner"] } }
```
