# 0032: One contact per person

**Status:** accepted (2026-11).

## Context

Agents, research sessions and members all add people, often at the same time. One chat added
Ben Tossell and David Cramer as investors. Twenty seconds later, the research sessions for their
new companies added both again from a people search. Each session had read the contact list
before the other one wrote, and only the agent's instructions guarded against duplicates. The API
and the database accepted any number of rows for one person.

## Decision

- **The API decides, in the create's transaction.** `Records.contacts.create` takes a
  transaction lock per workspace (`pg_advisory_xact_lock`), so two creates check and insert one
  at a time. It then compares the new person with the workspace's contacts, archived ones
  included.
- **One set of rules** (`findDuplicate` in `@crm/core/records`), used by the API and the web app:
  - the same LinkedIn handle, at any company (compared without host, case, encoding or tracking);
  - the same email, at any company, unless the two LinkedIn profiles differ;
  - the same last name and a compatible first name (the same, a known nickname, or a prefix of
    three letters or more: Ben and Benjamin) at the same company, unless the profiles differ.
- **What happens on a match depends on who adds them.** A member's create is refused with a
  message that names the contact (the New contact sheet checks first and offers View). A search
  result and an agent's `crm__create_contact` merge: nothing is added, empty fields of the
  existing contact fill in, and the agent gets `created: false` with the id and the reason.
- **The chat's people table** shows "In CRM" by the same rules, so a contact that research
  hasn't filled yet still counts.

## Consequences

- Two people with the same name at one company need different LinkedIn profiles to be added
  twice; a member can still add one and correct the name.
- A merge never restores an archived contact; the agent is told that a member archived them.
- Duplicates made before this stay until someone archives them. Companies have no such guard yet.
