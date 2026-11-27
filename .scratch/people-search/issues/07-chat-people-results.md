# Chat people results

Status: open
Type: task
Blocked by: 04
Spec: ../spec.md

Chat people finder.

- New skill `skills/find-people.md`.
- A `find_people` tool result renders a People results part (a new AI Elements component in
  `@crm/ui`, loaded with `preloadable()`): a table, selection with list keys, In CRM rows that
  open the sheet, and an email status chip.
- Add to CRM: optimistic contact creates (`source: "search"`), with the company matched or
  created by domain. Research then starts by itself.
- Find emails: sends the selection to the agent as a follow-up turn.
- Initials only; no hotlinked photos.
