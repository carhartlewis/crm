# Research skills

Status: open
Type: task
Blocked by: 04, 05
Spec: ../spec.md

Update `apps/agent/agent/skills/research-contact.md` and `research-company.md`, following
the spec's agent section. Every new contact gets find_email, find_phone and (when it lacks title or LinkedIn)
enrich_person, plus linkedin_profile for the photo. Every new company gets enrich_company. There are no toggles. Update
`instructions.md`: verify before outreach, never name vendors.

Eval: create 10 known contacts (name + company only). Expect ≥ 7 verified emails, no
wrong-domain emails applied, and phones only as facts until checked. Record the cost per record
from `usage_event`.
