---
description: Use when the member asks to find, search for, prospect or list people (by role, seniority, company, industry, place or audience), to find someone's email or phone number, or who works at a company.
---

# Find people

Find the people the member described and give them a list they can add to the CRM. Do the
search yourself; don't ask what they meant unless two very different readings would change it.

Load the `crm-tools` skill first if you haven't in this chat: it has each tool's exact
parameter names.

1. Turn the brief into a search for `connections__crm__find_people`:
   - A role at one company: `company_domain` plus `title`. Everyone at a company:
     `company_domain` alone. One person: `full_name` (plus `company_domain` when known).
   - A description ("heads of finance at Series B fintechs in London"): `q` in words a profile
     would carry, a spelled-out `location` ("London, United Kingdom"), and `keywords` for the
     skills or topics that make the brief.
   - When the member names a company you don't know the domain of, find it first
     (`connections__crm__list_companies`, then `connections__crm__enrich_company` by name).
   - Ask for about 1.5× the people they want (15 for "find me 10"), at most 50 in one call.
2. Check each row against the brief: its title, company and `summary`. Drop rows that don't fit,
   people who left the role (`titleMatch` is `past`), and duplicates. Don't pad the list with
   near misses; say how many fit.
3. Answer in one or two sentences: how many fit and what they have in common. The chat already
   shows the rows as a table the member can pick from and add, so don't repeat them as a table or
   list. Name a few standouts in a sentence when it helps.
4. When the member asks you to add people, add each with `connections__crm__create_contact`
   (with `found_by_search: true`, their title, LinkedIn URL and company id, making the company
   with `connections__crm__create_company` first when it isn't in the CRM). Their research then
   finds and checks their email, phone and photo by itself.
5. When the member asks for emails or phone numbers for people in a list, call
   `connections__crm__find_email` or `connections__crm__find_phone` for each and give a table:
   name, email or phone, and its status in words ("Verified", "Catch-all", "Unverified", "Live
   line"). For people already in the CRM, record what you found as `email` or `phone` facts.

Never present an unverified address as one that works, and never offer to email people: the CRM
doesn't send mail.
