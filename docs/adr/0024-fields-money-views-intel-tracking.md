# 0024: Custom fields, reporting currency, saved views, contact intel and website tracking

**Status:** accepted (2026-11). Extends [0023](0023-contacts-deals-and-activity.md).

## Context

After 0023 the CRM had companies, contacts, deals and activity, but not the rest of the product
it follows (trycompai/crm): workspace-defined fields, totals across currencies, saved list views,
the agent's research on people, mail and calendar history, and website visits.

## Decision

- **Custom fields** are rows, not columns: `field_definition` (entity, key, label, type, agent
  brief, where it shows), `field_option` for selects, and `field_value` (one per field and record,
  with a typed column per value kind). Archiving a field hides it everywhere and keeps its values.
  Rules live in `@crm/core/fields`; the API checks that a value's record is in the workspace and
  of the field's entity. The agent reads definitions and briefs and writes values through
  `crm__list_fields` / `crm__set_field_value`, only for fields marked agent-filled.
- **Reporting currency** is a per-workspace setting (`workspace_setting.reporting_currency`).
  Rates come daily from a public rates service into `exchange_rate` (shared, `source=fetched`);
  a member's manual rate (`source=manual`, per workspace) wins. Each deal stores its amount
  converted at write time (`base_amount`, `fx_rate`, `fx_rate_at`) and open deals are recomputed
  when the currency, a manual rate or the fetched rates change. Totals add `base_amount`; deals
  without a rate are counted apart and said so.
- **Saved views** store a list's URL query (`saved_view.query`), personal or shared. Applying a
  view writes the query back to the URL, so views and links are the same thing.
- **Contact intel is the agent's** (agentic-first): it proposes `contact_fact` rows (field, value,
  score, band, evidence, source) and writes one `contact_brief` per contact through CRM tools; the
  API only stores them. A member accepts a fact (it is written to the contact) or dismisses it.
  Research and Re-enrich start an agent conversation on the record, in its sheet's Agent tab
  (`chat.record_kind` / `record_id`).
- **Mail and calendar history** comes from the agent reading the member's connected apps through
  the MCP gateway and logging activities with `crm__log_email` / `crm__log_meeting`, one per
  thread or event (`activity.email_thread_id` / `calendar_event_id` are unique per workspace).
  The member's words are kept; nothing is invented.
- **Website tracking** is opt-in per workspace (`workspace_setting.tracking_key`): a small public
  script records page views into `website_visit`; `identify(email)` links a visitor to a contact
  and its company. There is no IP-to-company lookup: guessing who a visitor is would be
  enrichment, and that is the agent's job.

## Consequences

- New synced tables follow ADR 0012: one shape each, filtered by workspace.
- Fetching exchange rates is the API's only outbound call for this work; it is data, not a
  judgement, so it does not conflict with agentic-first.
