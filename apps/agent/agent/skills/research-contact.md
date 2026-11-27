---
description: Use when asked to research, enrich, identify or re-enrich a contact in the CRM (the contact sheet's Re-enrich button, a Find email or Find phone action, or a background research run when a contact is added), or to write their background.
---

# Research a contact

Fill as much of the contact as sources support, without asking the member. Facts you are sure of
are saved at once; a value a member typed is kept unless the evidence shows a real change. Never
ask a member to confirm what you found.

1. Read the contact (`connections__crm__get_contact`) and their company
   (`connections__crm__get_company`, for its domain). Call
   `connections__crm__set_enrichment_status` with kind `contact` and `running`.
2. Identify them with `connections__crm__enrich_person`: their work email (best), their LinkedIn
   URL, or their full name with the company's domain. Use the match only when its employer fits
   the CRM's company (same name or domain). It gives their title, employer, location and
   LinkedIn URL.
3. Email: when the contact has none, call `connections__crm__find_email` with their full name and
   the company's domain (or their LinkedIn URL). Record what it returns as an `email` fact,
   whatever its `status`: the CRM keeps a verified or catch-all address and drops the rest. Skip
   an address whose `sameDomain` is false: it is probably a former employer's.
4. Phone: when the contact has none, call `connections__crm__find_phone` with their LinkedIn URL
   (best), work email, or name with domain. Record the number as a `phone` fact with its
   `phone_type`; the CRM keeps a live or unchecked line and drops a dead one.
5. Photo: call `connections__crm__find_photo` with their LinkedIn URL, work email, and name with
   domain. Record its `photoUrl` as an `image_url` fact (score 0.9 when it came from their
   LinkedIn profile).
6. Record each of title, seniority, function, LinkedIn, X and GitHub that a source gives with
   `connections__crm__record_contact_fact`: the value, a score from 0 to 1 (0.9+ for their own
   profile or a lookup whose employer matches; lower for indirect mentions), the page as
   `source_url` and a short quote as `evidence`. Seniority is one of Executive, Director,
   Manager or Individual contributor; function is a department such as Engineering, Finance or
   Sales.
7. If the lookups miss, search the web (`web_search`, `web_fetch`,
   `connections__crm__read_web_page`): their LinkedIn, X and GitHub profiles, the company's team
   or about page, talks and articles. Search by name plus company, never by private details. Make
   sure each profile is the same person (same company, role or location); drop leads that don't
   match.
8. Write their background with `connections__crm__write_contact_brief`: two or three sentences on
   what they do and own, plus current role, tenure, previous roles, seniority, function and where
   they are based. Only what sources say.
9. If the workspace has custom fields for contacts that your agents fill
   (`connections__crm__list_fields`), set each one a source answers with
   `connections__crm__set_field_value`, following its brief.
10. Call `connections__crm__set_enrichment_status` with `complete` (or `skipped` when you couldn't
    find them, or `failed` with the reason).
11. Reply in two or three sentences: who they are, and what you filled in. Mention any value that
    waits on their sheet because it differs from one a member typed.
