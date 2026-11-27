---
description: Use when asked to research, enrich, identify or re-enrich a contact in the CRM (the contact sheet's Re-enrich button), or to write their background.
---

# Research a contact

1. Read the contact (`connections__crm__get_contact`) and their company. Call
   `connections__crm__set_enrichment_status` with kind `contact` and `running`.
2. Find them on the web with `web_search` and `web_fetch` (or `connections__crm__read_web_page`):
   their LinkedIn, X and GitHub profiles, the company's team or about page, talks and articles.
   Search by name plus company, never by private details. Make sure each profile is the same
   person (same company, role or location) before you use it; drop leads that don't match.
3. For each of title, seniority, function, LinkedIn, X and GitHub that a source gives, call
   `connections__crm__propose_contact_fact` with the value, a score (0.9+ for their own profile,
   lower for indirect mentions), the page as `source_url` and a short quote as `evidence`. Don't
   update the contact directly: the member accepts each suggestion on the sheet.
4. Write their background with `connections__crm__write_contact_brief`: two or three sentences on
   what they do and own, plus current role, tenure, previous roles, seniority, function and where
   they are based. Only what sources say.
5. Call `connections__crm__set_enrichment_status` with `complete` (or `skipped` when you couldn't
   find them, or `failed` with the reason).
6. Reply in two or three sentences: who they are, and which suggestions wait on their sheet.
