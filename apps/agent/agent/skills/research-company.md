---
description: Use when asked to research, enrich or fill in a company in the CRM (the company sheet's Research button, a Find people here action, or a background research run when a company is added).
---

# Research a company, fill its profile and add its key people

Fill as much as sources support, without asking the member. Never ask a member to confirm what
you found. Members see every saved update immediately: save useful results as you find them,
never collect everything for one final batch. Keep `running` until your writes have finished.

1. Read the company (`connections__crm__get_company`). Call `connections__crm__set_enrichment_status`
   with `running`.
2. Look it up: `connections__crm__enrich_company` by its domain (or name), which gives its
   description, industry, headcount, founded year, location and LinkedIn page. Save those
   supported fields immediately with `connections__crm__update_company`. Never overwrite a
   value a member typed with a guess; change it only when a source clearly says otherwise,
   and say so.
3. Add its key people early, before crawling pages or writing a full company profile:
   - List who is already in the CRM there (`connections__crm__list_contacts` with its id).
   - Find people with `connections__crm__find_people` by its `company_domain`, limit 15. If that
     returns no one, try again with `q` naming the company and "founder", "CEO" or "leadership".
   - Keep at most five people who work there now: founders, the CEO and other executives first,
     then heads of the functions that matter to this workspace (sales, finance, security, IT,
     operations). Drop rows whose company or domain doesn't match, people who left
     (`titleMatch` is `past`), and anyone already in the CRM (`contactId` is set, or the same
     name). Another session may add people here while you search; the CRM catches that.
   - Add each with `connections__crm__create_contact`: first and last name, title, LinkedIn URL,
     the company's id, and `found_by_search: true`. Leave the email out unless the row's
     `emailStatus` is verified; their own research finds and checks it. Save each contact as
     soon as its identity and current employer are confirmed. Do not wait for a photo, email,
     phone or brief, and do not research each person yourself: creating the row starts their
     independent background research, so their details and photos arrive while you continue.
     When `create_contact` answers `created: false`, the person was already there: count them
     as found, not added, and don't add them again.
4. Fill the gaps with `connections__crm__lookup_company` and its own site through
   `connections__crm__read_web_page` (home, about, contact, pricing), and `web_search` for recent
   news when useful. Save supported fields after each source with
   `connections__crm__update_company`: description (two or three sentences on what it does
   and for whom), industry, employee count, founded year, city, country, phone, email, website,
   and LinkedIn, X and GitHub URLs. Do not hold earlier results until these lookups finish.
5. If the workspace has custom fields with agent briefs for companies
   (`connections__crm__list_fields`), fill each one the sources answer with
   `connections__crm__set_field_value`, following its brief.
6. Call `connections__crm__set_enrichment_status` with `complete` (or `skipped` when nothing could
   be found, or `failed` with the reason).
7. Reply with a short table of what you filled in and where each value came from, then the people
   you added in one sentence, then any conflict in one sentence.
