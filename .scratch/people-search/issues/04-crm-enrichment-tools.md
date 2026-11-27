# Crm enrichment tools

Status: open
Type: task
Blocked by: 03
Spec: ../spec.md

`apps/api/src/services/enrichment-tools.ts`, merged into `crmTools.forCaller`. These are
listed only when the Enrichment service is configured.

Tools: find_people, find_email (Verify always on), verify_email, find_phone (HLR check on),
enrich_person, enrich_company, find_companies, similar_companies, linkedin_profile. Each is
`readOnly: true` (no approvals; spend rules come later) and takes an optional `record`
({kind, id}) for the ledger.

Remove the agent tool `crm__lookup_person` and update `research-contact.md` and
`instructions.md`. Keep `WebReader.findPerson` as the server-side photo fallback, and keep
`lookup_company` and `read_web_page`.

`linkedin_profile` returns `photoUrl`, read from a known list of `raw` keys (`avatar`,
`profile_pic_url`, `profile_picture`, `photo_url`). Cover it with fixtures, including the
Bright Data response from the smoke test.

`find_people` caps `limit` at 50. It returns compact rows (drop raw), a `resultId`, and marks
rows already in the CRM (email or LinkedIn match in the workspace). Results never include
vendor names.
