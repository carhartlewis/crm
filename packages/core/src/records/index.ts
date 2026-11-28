/**
 * CRM record rules shared by the API (writes) and the web app (inline editors, labels): deal
 * stages, currencies, enrichment states, and the editable fields of companies, contacts and
 * deals with one normaliser each. Client-safe.
 */

import { normalizeCompanyDomain } from "../company/index.ts";
import { ID_PREFIXES, isRecordId } from "../ids/index.ts";
import { normalizeWebsite } from "../workspace/index.ts";

/** How a stage reads in a badge: its dot colour. */
export type StageTone = "neutral" | "info" | "warning" | "success" | "error";

/** Deal stages in pipeline order. The first four are open; the rest close the deal. */
export const DEAL_STAGES = [
  { id: "demo_booked", label: "Demo booked", tone: "neutral", open: true },
  { id: "qualified_to_buy", label: "Qualified to buy", tone: "info", open: true },
  { id: "decision_maker_bought_in", label: "Decision maker in", tone: "info", open: true },
  { id: "contract_sent", label: "Contract sent", tone: "warning", open: true },
  { id: "closed_won", label: "Closed won", tone: "success", open: false },
  { id: "closed_lost", label: "Closed lost", tone: "error", open: false },
  { id: "unqualified_to_buy", label: "Unqualified", tone: "neutral", open: false },
] as const satisfies readonly { id: string; label: string; tone: StageTone; open: boolean }[];

export type DealStage = (typeof DEAL_STAGES)[number]["id"];

export const DEFAULT_DEAL_STAGE: DealStage = "demo_booked";

const STAGE_IDS = new Set<string>(DEAL_STAGES.map((stage) => stage.id));

export function isDealStage(value: string): value is DealStage {
  return STAGE_IDS.has(value);
}

export function dealStage(id: string) {
  return DEAL_STAGES.find((stage) => stage.id === id) ?? DEAL_STAGES[0];
}

export function isOpenStage(id: string) {
  return dealStage(id).open;
}

/** Losing stages ask why the deal closed. */
export function isLosingStage(id: string) {
  return id === "closed_lost" || id === "unqualified_to_buy";
}

/** The stage stepper's steps: the open stages, then the stage the deal closed in (or Closed won). */
export function stageSteps(current: string) {
  const open = DEAL_STAGES.filter((stage) => stage.open);
  const closed = isOpenStage(current) ? dealStage("closed_won") : dealStage(current);

  return [...open, closed];
}

export const CURRENCIES = [
  { code: "USD", name: "US Dollar", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "GBP", name: "British Pound", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", decimals: 2 },
  { code: "ZAR", name: "South African Rand", decimals: 2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Totals (open pipeline) add up deals in this currency; others are counted apart. */
export const REPORTING_CURRENCY: CurrencyCode = "USD";

export function isCurrency(value: string): value is CurrencyCode {
  return CURRENCIES.some((currency) => currency.code === value);
}

export const ENRICHMENT_STATUSES = [
  { id: "pending", label: "Not researched" },
  { id: "running", label: "Researching" },
  { id: "complete", label: "Enriched" },
  { id: "failed", label: "Enrichment failed" },
  { id: "skipped", label: "Nothing found" },
] as const;

export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number]["id"];

export function enrichmentLabel(id: string) {
  return ENRICHMENT_STATUSES.find((status) => status.id === id)?.label ?? id;
}

/** How a row arrived; `search` is a person a member added from a people search. */
export const RECORD_SOURCES = [
  "manual",
  "import",
  "email",
  "calendar",
  "tracking",
  "search",
] as const;

const RECORD_SOURCE_SET = new Set<string>(RECORD_SOURCES);

export function isRecordSource(value: string): value is (typeof RECORD_SOURCES)[number] {
  return RECORD_SOURCE_SET.has(value);
}

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
  "task",
  "stage_change",
  "enrichment",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** What members log by hand from the Activity tab; the CRM writes the rest. */
export const LOGGED_ACTIVITY_TYPES = ["note", "call", "email", "meeting", "task"] as const;

export type LoggedActivityType = (typeof LOGGED_ACTIVITY_TYPES)[number];

const LOGGED_TYPES = new Set<string>(LOGGED_ACTIVITY_TYPES);

export function isLoggedActivityType(value: string): value is LoggedActivityType {
  return LOGGED_TYPES.has(value);
}

export const isContactId = (value: string) => isRecordId(ID_PREFIXES.contact, value);
export const isDealId = (value: string) => isRecordId(ID_PREFIXES.deal, value);
export const isActivityId = (value: string) => isRecordId(ID_PREFIXES.activity, value);

/** A field's value after normalising, or the message to show next to it. */
export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): FieldResult<T> => ({ ok: true, value });
const fail = (message: string): FieldResult<never> => ({ ok: false, message });

const collapse = (input: string) => input.trim().replaceAll(/\s+/g, " ");

/** Required one-line text: trimmed, whitespace collapsed, 1 to `max` characters. */
export function requiredText(input: string, label: string, max = 200): FieldResult<string> {
  const text = collapse(input);

  if (!text) return fail(`Enter a ${label.toLowerCase()}`);

  return text.length > max ? fail(`Keep it under ${max} characters`) : ok(text);
}

/** Optional one-line text; blank is `null`. */
export function optionalText(input: string | null, max = 200): FieldResult<string | null> {
  if (input === null) return ok(null);

  const text = collapse(input);

  if (!text) return ok(null);

  return text.length > max ? fail(`Keep it under ${max} characters`) : ok(text);
}

/** Optional prose: keeps line breaks, trims the ends; blank is `null`. */
export function optionalProse(input: string | null, max = 10_000): FieldResult<string | null> {
  const text = input?.trim() ?? "";

  if (!text) return ok(null);

  return text.length > max ? fail(`Keep it under ${max} characters`) : ok(text);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Optional email, stored lowercase. */
export function optionalEmail(input: string | null): FieldResult<string | null> {
  const text = input?.trim().toLowerCase() ?? "";

  if (!text) return ok(null);

  return EMAIL.test(text) && text.length <= 254 ? ok(text) : fail("Enter a valid email");
}

/** Optional web address, stored as an absolute `https:` URL. */
export function optionalUrl(input: string | null): FieldResult<string | null> {
  const text = input?.trim() ?? "";

  if (!text) return ok(null);

  const website = normalizeWebsite(text);

  return website.ok ? ok(website.url) : fail("Enter a valid link");
}

/** Optional phone number: digits with the usual separators, 5 to 32 characters. */
export function optionalPhone(input: string | null): FieldResult<string | null> {
  const text = collapse(input ?? "");

  if (!text) return ok(null);

  return /^\+?[\d\s().-]{5,32}$/.test(text) ? ok(text) : fail("Enter a valid phone number");
}

/** Optional domain, as companies store it (`normalizeCompanyDomain`). */
export function optionalDomain(input: string | null): FieldResult<string | null> {
  const domain = normalizeCompanyDomain(input);

  return domain.ok ? ok(domain.domain) : fail(domain.message);
}

/**
 * Optional money amount such as `186000`, `$186,000.50` or `1.2k`: stored as decimal text with
 * two places, at most 12 digits before the point.
 */
export function optionalMoney(input: string | null): FieldResult<string | null> {
  const text =
    input
      ?.trim()
      .toLowerCase()
      .replaceAll(/[\s,$€£¥]/g, "") ?? "";

  if (!text) return ok(null);

  const match = /^(\d+(?:\.\d+)?)([km]?)$/.exec(text);

  if (!match) return fail("Enter an amount, like 186000");

  const scale = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  const value = Math.round(Number(match[1]) * scale * 100) / 100;

  if (!Number.isFinite(value) || value >= 1e12) return fail("That amount is too large");

  return ok(value.toFixed(2));
}

/** Optional calendar date, `YYYY-MM-DD`. */
export function optionalDate(input: string | null): FieldResult<string | null> {
  const text = input?.trim() ?? "";

  if (!text) return ok(null);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fail("Enter a date");

  const date = new Date(`${text}T00:00:00Z`);

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text
    ? fail("Enter a date")
    : ok(text);
}

export function currencyField(input: string | null): FieldResult<string> {
  const code = input?.trim().toUpperCase() ?? "";

  return isCurrency(code) ? ok(code) : fail("Choose a currency");
}

/**
 * How a field is edited and normalised. `required` text may not be blank; the reference kinds
 * (`user`, `company`) hold an id the API checks against the workspace.
 */
export type FieldKind =
  | "title"
  | "text"
  | "prose"
  | "email"
  | "url"
  | "phone"
  | "domain"
  | "money"
  | "date"
  | "currency"
  | "user"
  | "company"
  | "required-company"
  | "required-user";

export interface FieldSpec {
  /** The synced column (snake_case), which is also the key the API's PATCH takes. */
  readonly column: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly placeholder?: string;
  /** The longest a `text` value may be; 200 when left out. */
  readonly max?: number;
}

export const COMPANY_FIELDS = [
  { column: "name", label: "Name", kind: "title" },
  { column: "domain", label: "Domain", kind: "domain", placeholder: "acme.com" },
  { column: "website", label: "Website", kind: "url", placeholder: "https://acme.com" },
  { column: "phone", label: "Phone", kind: "phone" },
  { column: "email", label: "Email", kind: "email" },
  { column: "industry", label: "Industry", kind: "text" },
  { column: "city", label: "City", kind: "text" },
  { column: "country", label: "Country", kind: "text" },
  { column: "employee_count", label: "Employees", kind: "text", placeholder: "51-200", max: 40 },
  { column: "founded_year", label: "Founded", kind: "text", placeholder: "2019", max: 12 },
  { column: "owner_id", label: "Owner", kind: "user" },
  { column: "description", label: "About", kind: "prose" },
  { column: "linkedin_url", label: "LinkedIn", kind: "url" },
  { column: "twitter_url", label: "X", kind: "url" },
  { column: "github_url", label: "GitHub", kind: "url" },
] as const satisfies readonly FieldSpec[];

export const CONTACT_FIELDS = [
  { column: "first_name", label: "First name", kind: "title" },
  { column: "last_name", label: "Last name", kind: "text" },
  { column: "title", label: "Title", kind: "text", placeholder: "Head of Security" },
  { column: "email", label: "Email", kind: "email" },
  { column: "phone", label: "Phone", kind: "phone" },
  { column: "linkedin_url", label: "LinkedIn", kind: "url" },
  { column: "twitter_url", label: "X", kind: "url" },
  { column: "github_url", label: "GitHub", kind: "url" },
  { column: "seniority", label: "Seniority", kind: "text" },
  { column: "function", label: "Function", kind: "text" },
  { column: "company_id", label: "Company", kind: "company" },
  { column: "owner_id", label: "Owner", kind: "user" },
] as const satisfies readonly FieldSpec[];

export const DEAL_FIELDS = [
  { column: "name", label: "Name", kind: "title" },
  { column: "amount", label: "Amount", kind: "money" },
  { column: "currency", label: "Currency", kind: "currency" },
  { column: "expected_close_date", label: "Close date", kind: "date" },
  { column: "company_id", label: "Company", kind: "required-company" },
  { column: "owner_id", label: "Owner", kind: "user" },
  { column: "description", label: "Description", kind: "prose" },
] as const satisfies readonly FieldSpec[];

/** A contact's part in a deal (`deal_contact.role`); the API applies the same limit. */
export const DEAL_CONTACT_ROLE_FIELD = {
  column: "role",
  label: "Role",
  kind: "text",
  placeholder: "Champion",
  max: 80,
} as const satisfies FieldSpec;

/** Why a lost or unqualified deal closed (`deal.closed_reason`); the API applies the same limit. */
export const DEAL_CLOSED_REASON_FIELD = {
  column: "closed_reason",
  label: "Reason",
  kind: "text",
  placeholder: "Went with a competitor",
  max: 500,
} as const satisfies FieldSpec;

export type CompanyColumn = (typeof COMPANY_FIELDS)[number]["column"];

export type ContactColumn = (typeof CONTACT_FIELDS)[number]["column"];

export type DealColumn = (typeof DEAL_FIELDS)[number]["column"];

/** Normalises one field's raw input by its kind. Ids are checked for shape only here. */
export function normalizeField(spec: FieldSpec, input: string | null): FieldResult<string | null> {
  switch (spec.kind) {
    case "title":
      return requiredText(input ?? "", spec.label);
    case "text":
      return optionalText(input, spec.max);
    case "prose":
      return optionalProse(input);
    case "email":
      return optionalEmail(input);
    case "url":
      return optionalUrl(input);
    case "phone":
      return optionalPhone(input);
    case "domain":
      return optionalDomain(input);
    case "money":
      return optionalMoney(input);
    case "date":
      return optionalDate(input);
    case "currency":
      return currencyField(input);
    case "user":
      return input?.trim() ? ok(input.trim()) : ok(null);
    case "company":
      if (!input?.trim()) return ok(null);

      return isRecordId(ID_PREFIXES.company, input.trim())
        ? ok(input.trim())
        : fail("Choose a company");
    case "required-company":
      return input && isRecordId(ID_PREFIXES.company, input.trim())
        ? ok(input.trim())
        : fail("Choose a company");
    case "required-user":
      return input?.trim() ? ok(input.trim()) : fail("Choose an owner");
  }
}

/** A form validator: the message, or `undefined` when the value is valid. */
export function fieldError(spec: FieldSpec, input: string | null) {
  const result = normalizeField(spec, input);

  return result.ok ? undefined : result.message;
}

export type PatchResult = FieldResult<Record<string, string | null>>;

/**
 * Normalises a PATCH body against a kind's fields: only listed columns, each normalised, absent
 * keys left out. Unknown keys are refused so a typo never silently does nothing.
 */
export function normalizePatch(
  fields: readonly FieldSpec[],
  input: Readonly<Record<string, string | null | undefined>>,
): PatchResult {
  const patch: Record<string, string | null> = {};

  for (const [column, raw] of Object.entries(input)) {
    if (raw === undefined) continue;

    const spec = fields.find((field) => field.column === column);

    if (!spec) return fail(`${column} can't be changed`);

    const result = normalizeField(spec, raw);

    if (!result.ok) return fail(`${spec.label}: ${result.message}`);

    patch[column] = result.value;
  }

  return ok(patch);
}

/** A contact's display name: first and last name. */
export function contactName(contact: { first_name: string; last_name: string | null }) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

/** A full name split for the contact columns. */
export interface PersonName {
  readonly first: string;
  readonly last: string | null;
}

/**
 * Splits a typed full name into first and last name: the last word is the last name, so
 * "Priya Raghunathan" and "Mary Ann Smith" both read naturally.
 */
export function splitName(input: string): PersonName {
  const words = collapse(input).split(" ").filter(Boolean);

  if (words.length <= 1) return { first: words[0] ?? "", last: null };

  return { first: words.slice(0, -1).join(" "), last: words.at(-1) ?? null };
}

/** Formats a decimal amount in its currency: `$186,000`, cents only when present. */
export function formatMoney(amount: string | number | null, currency: string = REPORTING_CURRENCY) {
  if (amount === null || amount === "") return null;

  const value = Number(amount);

  if (!Number.isFinite(value)) return null;

  const info = CURRENCIES.find((entry) => entry.code === currency);
  const cents = info?.decimals !== 0 && !Number.isInteger(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/** Compact money for footers: `$1.2M`, `$186K`. */
export function formatMoneyCompact(amount: number, currency: string = REPORTING_CURRENCY) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export interface PipelineDeal {
  readonly stage: string;
  readonly amount: string | null;
  readonly currency: string;
  /** The amount in the reporting currency, stored by the API (ADR 0024). */
  readonly base_amount?: string | null;
  readonly base_currency?: string | null;
  readonly expected_close_date: string | null;
  readonly archived_at: string | null;
}

/**
 * The open deals' totals in `reporting`: the sum of their stored base amounts (a deal already in
 * `reporting` counts its own amount, so a new row counts before the API stores its base), how
 * many open deals with an amount are left out for want of a rate and in which currencies, and
 * the earliest expected close.
 */
export function pipelineSummary(
  deals: readonly PipelineDeal[],
  reporting: string = REPORTING_CURRENCY,
) {
  const open = deals.filter((deal) => deal.archived_at === null && isOpenStage(deal.stage));
  let total = 0;
  let notCounted = 0;
  const missing = new Set<string>();
  let nextClose: string | null = null;

  for (const deal of open) {
    if (deal.amount !== null) {
      if (deal.currency === reporting) total += Number(deal.amount);
      else if (deal.base_amount != null && deal.base_currency === reporting) {
        total += Number(deal.base_amount);
      } else {
        notCounted += 1;
        missing.add(deal.currency);
      }
    }

    if (deal.expected_close_date && (!nextClose || deal.expected_close_date < nextClose)) {
      nextClose = deal.expected_close_date;
    }
  }

  return {
    openCount: open.length,
    total,
    notCounted,
    missing: [...missing].toSorted(),
    nextClose,
  };
}

/**
 * When a deal closes relative to `today` (`YYYY-MM-DD`), for the Closing filter. Overdue is an
 * open deal past its date.
 */
export type ClosingBucket = "overdue" | "this_month" | "next_month" | "later" | "none";

export const CLOSING_BUCKETS = [
  { id: "overdue", label: "Overdue" },
  { id: "this_month", label: "Closing this month" },
  { id: "next_month", label: "Closing next month" },
  { id: "later", label: "Later" },
  { id: "none", label: "No close date" },
] as const satisfies readonly { id: ClosingBucket; label: string }[];

export function closingBucket(
  deal: { stage: string; expected_close_date: string | null },
  today: string,
): ClosingBucket | null {
  const date = deal.expected_close_date;

  if (!date) return "none";

  if (date < today && isOpenStage(deal.stage)) return "overdue";

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const thisMonth = today.slice(0, 7);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  if (date.slice(0, 7) === thisMonth) return "this_month";

  if (date.slice(0, 7) === next) return "next_month";

  // A closed deal from an earlier month is in no bucket.
  return date < today ? null : "later";
}

export * from "./intel.ts";

export * from "./duplicates.ts";
