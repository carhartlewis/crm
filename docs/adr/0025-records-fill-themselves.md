# 0025: Records fill themselves

**Status:** accepted (2026-11). Supersedes the "member accepts each fact" part of [0024](0024-fields-money-views-intel-tracking.md). People lookup, email and phone facts and photos are amended by [0027](0027-enrichment-through-treg.md). Extended to deals by [0029](0029-contact-and-deal-research-is-memory.md).

## Context

0024 had the agent propose each contact fact for a member to accept or dismiss, and research ran
only when a member pressed Research. Members want records filled without approving anything:
asking should be very rare (under 1% of facts). context.dev now has a people API
(`POST /people/enrich`) with photos, roles and a match score.

## Decision

- **Research starts by itself.** When a company or contact is created (by a member or the agent),
  the API's `Research` service starts a background eve session as the creating member, in Auto
  permissions, about that record (`POST /eve/v1/session` with the research message and
  `operationId: research:<id>`). Nobody watches it; the sheet shows "Researching" and values
  arrive through sync. ~~Each workspace may start 30 runs per 10 minutes.~~ (No cap since 0029.) The API only starts the
  session; the agent does the research (agentic-first).
- **"Fill the rest"** (`POST /api/fields/:id/fill`) starts the same kind of session to fill one
  agent-filled custom field on every record without a value.
- **People lookup.** `crm__lookup_person` calls context.dev's people enrich with a work email,
  profile URLs, or a name and company, and returns the candidate with its score. The agent judges
  whether the candidate is the contact.
- **Facts apply themselves** (`crm__record_contact_fact`, rules in `factOutcome`,
  `@crm/core/records`):
  - below 0.6 nothing is stored;
  - a sure fact fills an empty field, confirms the same value, or replaces a value an earlier
    agent fact wrote;
  - a member's own value stays, unless Jev (`typesafe-ai/jev`, `fact-judge.ts`) reads the new value
    as a real change and the agent is at least 0.9 sure: then it is applied. Jev's "same thing in
    other words" keeps the member's value silently. Only a 0.9+ fact that Jev can't place waits
    for a member as a suggestion.
  - Jev runs between two transactions, and a member who types a value in between gets the
    suggestion instead of losing it.
- **Photos** are recorded as `image_url` facts with the lookup's `avatar_url`. The API copies them
  into storage (`contacts/<id>/photo`) only from `https://media.brand.dev`, so the server never
  fetches other agent-supplied URLs, and a photo never becomes a suggestion (accepting one would
  store a hotlink).

## Consequences

- Most contacts gain a title, seniority, function, links, photo and background within a minute of
  being added, with no clicks. Proposals remain for the rare real conflict.
- Every create costs an agent run and context.dev credits (people enrich: 20 per match).
- Values the agent writes can be wrong; each is a stored fact with its score, source and evidence.
