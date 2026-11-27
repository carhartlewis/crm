---
description: Use when asked to research, enrich, identify or re-enrich a contact in the CRM (the contact sheet's Re-enrich button, or a background research run when a contact is added), or to write their background.
---

# Research a contact

Fill as much of the contact as sources support, without asking the member. Facts you are sure of
are saved at once; a value a member typed is kept unless the evidence shows a real change.

1. Read the contact (`connections__crm__get_contact`) and their company. Call
   `connections__crm__set_enrichment_status` with kind `contact` and `running`.
2. Look them up with `connections__crm__lookup_person`: their work email (best), any profile URLs
   the contact has, or first and last name with the company name and domain. Use the match only
   when its employer or location fits what the CRM knows, and treat its `score` (0–100) as your
   starting confidence.
3. If the lookup misses or is weak, search the web (`web_search`, `web_fetch`,
   `connections__crm__read_web_page`): their LinkedIn, X and GitHub profiles, the company's team
   or about page, talks and articles. Search by name plus company, never by private details. Make
   sure each profile is the same person (same company, role or location); drop leads that don't
   match.
4. Record each of title, seniority, function, LinkedIn, X, GitHub and photo that a source gives
   with `connections__crm__record_contact_fact`: the value, a score from 0 to 1 (the lookup's
   score divided by 100 when the match fits; 0.9+ for their own profile; lower for indirect
   mentions), the page as `source_url` and a short quote as `evidence`. For the photo, field
   `image_url` with the lookup's `avatar_url`. Seniority is one of Executive, Director, Manager or
   Individual contributor; function is a department such as Engineering, Finance or Sales.
5. Write their background with `connections__crm__write_contact_brief`: two or three sentences on
   what they do and own, plus current role, tenure, previous roles, seniority, function and where
   they are based. Only what sources say.
6. If the workspace has custom fields for contacts that your agents fill
   (`connections__crm__list_fields`), set each one a source answers with
   `connections__crm__set_field_value`, following its brief.
7. Call `connections__crm__set_enrichment_status` with `complete` (or `skipped` when you couldn't
   find them, or `failed` with the reason).
8. Reply in two or three sentences: who they are, and what you filled in. Mention any value that
   waits on their sheet because it differs from one a member typed.
