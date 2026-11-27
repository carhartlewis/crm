# 0023: Contacts, deals and activity

**Status:** accepted (2026-11).

## Context

The CRM had companies with a name, a domain and an owner. The product it follows (trycompai/crm)
and the Paper designs ("Companies", "Contacts", "Deals" pages) have contacts, deals with a
pipeline, a log of notes, calls, emails, meetings and tasks, and a full set of company fields
with logos.

## Decision

- **Tables:** `company` gains the fields of the reference: website, description, logo and icon
  URLs with a tone, brand colour, industry, location, phone, email, social links, primary contact,
  enrichment state, source, `last_activity_at` and `archived_at`. New tables are `contact`, `deal`,
  `deal_contact` (who is on a deal, with a role) and `activity`. Stages, currencies, enrichment
  states, sources and activity types are text columns whose values live in `@crm/core/records`,
  not Postgres enums, so a new stage is a code change with no migration.
- **One rule set:** `@crm/core/records` lists each kind's editable fields (`COMPANY_FIELDS`,
  `CONTACT_FIELDS`, `DEAL_FIELDS`) with one normaliser per field kind. The API normalises every
  PATCH with it, and the web's inline editors check a value with the same function before saving.
- **Writes:** one store (`apps/api/src/services/record-store.ts`) for every record table, used by
  `Companies` and `Records` (contacts, deals, deal contacts, activity). Each write checks
  membership and references (owner is a member; company, contact and deal are in the workspace) in
  the transaction that returns the txid. A stage change stamps `stage_changed_at`, sets or clears
  `closed_at`, needs a reason for Closed lost and Unqualified, and logs a `stage_change` activity.
  Logging an activity moves `last_activity_at` forward on its company, contact and deal.
- **Sync:** each table has its own shape (`CONTACTS_SYNC_PATH`, `DEALS_SYNC_PATH`,
  `DEAL_CONTACTS_SYNC_PATH`, `ACTIVITIES_SYNC_PATH`), filtered by workspace, and one optimistic
  collection per workspace (`lib/synced-records.ts`). Counts, open pipeline and next close are
  derived in the browser from synced rows, never stored.
- **Logos:** a company's square logo is copied into our storage (`ImageCache.logo`) when it gets a
  domain, when the domain changes, on Re-enrich, and once at API start for companies without one.
  A new domain clears the old logo first. Tables, sheets and chat replies show it through
  `EntityLogo`, which falls back to initials.
- **Totals** add up deals in the reporting currency (USD); deals in other currencies are counted
  apart and said so, until exchange rates exist.
- **Archive** hides a record from lists (the Status filter shows archived ones); Delete removes
  it. Deleting a company deletes its deals; its contacts stay, without a company.

## Not yet

The reference's custom fields, saved views, website tracking, contact briefs ("Background"),
email and calendar sync ("We know them" counts only logged activity), exchange rates, and the
record sheets' Agent tab are not built. The company sheet keeps its Knowledge tab (ADR 0014).
