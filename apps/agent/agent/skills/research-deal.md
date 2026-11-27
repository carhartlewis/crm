---
description: Use when asked to research a deal in the CRM (a background research run when a deal is added, or a member asking to research or brief a deal), or to write a deal brief.
---

# Research a deal and write its brief

Find what matters to this deal and save it as the deal's memory, without asking the member.
Never change the deal's stage, amount, close date or owner: those are the member's.

1. Read the deal (`connections__crm__get_deal`), its company
   (`connections__crm__get_company`), the people at the company
   (`connections__crm__list_contacts` with its id) and what the CRM remembers: the deal, the
   company and the workspace's own company (`connections__crm__search_memory` with `dealId`, then
   `companyId`, then neither). The workspace's own memory says what it sells; research the deal
   against that.
2. Research the buyer's situation that bears on this deal: recent news, funding, hiring, leadership
   changes, launches, regulation or audits they face, and the tools they use today for what the
   workspace sells (`web_search`, `web_fetch`, `connections__crm__read_web_page` on their site,
   blog, careers and press pages; `connections__crm__enrich_company` if the company has no
   profile yet). Keep only what a source says and what matters to the deal.
3. Name the buying group: the deal's people and the company's contacts who decide or influence
   a purchase like this (title and function). If no one in the CRM can sign, say which role is
   missing. Don't add contacts here; the company's research does that.
4. Save the brief with `connections__crm__write_deal_brief`: a narrative of three to five
   sentences (who is buying, what they need and why, where the deal stands), plus why now, needs,
   buying group, competitors and current tools, risks, open questions, next steps and the source
   URLs. Leave out any part you have nothing for. Writing it again replaces the earlier brief.
5. If the workspace has custom fields for deals that your agents fill
   (`connections__crm__list_fields`), set each one a source answers with
   `connections__crm__set_field_value`, following its brief.
6. Reply in two or three sentences: the deal's buyer, why now, and the biggest open question.
