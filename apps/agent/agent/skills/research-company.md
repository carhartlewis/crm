---
description: Use when asked to research, enrich or fill in a company in the CRM (the company sheet's Research button).
---

# Research a company and fill its profile

1. Read the company (`connections__crm__get_company`). Call `connections__crm__set_enrichment_status`
   with `running`.
2. Look it up on the web: `connections__crm__lookup_company` by its domain (or name), then its own
   site with `connections__crm__read_web_page` (home, about, contact, pricing), and `web_search`
   for recent news when useful.
3. Fill what the sources say with one `connections__crm__update_company`: description (two or
   three sentences on what it does and for whom), industry, city, country, phone, email, website,
   and LinkedIn, X and GitHub URLs. Never overwrite a value a member typed with a guess; change it
   only when a source clearly says otherwise, and say so.
4. If the workspace has custom fields with agent briefs for companies
   (`connections__crm__list_fields`), fill each one the sources answer with
   `connections__crm__set_field_value`, following its brief.
5. Call `connections__crm__set_enrichment_status` with `complete` (or `skipped` when nothing could
   be found, or `failed` with the reason).
6. Reply with a short table of what you filled in and where each value came from, then any
   conflict in one sentence.
