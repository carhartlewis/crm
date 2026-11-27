/**
 * Custom fields: the rules shared by the API (writes, agent tools) and the web app (settings
 * form, inline editors). A workspace adds its own fields to companies, contacts and deals; each
 * field has a type, a stable key made from its label, and an optional brief that tells the
 * agent what counts as an answer. Client-safe.
 */

import { ID_PREFIXES, isRecordId } from "../ids/index.ts";
import {
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  DEAL_FIELDS,
  type FieldResult,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalProse,
  optionalText,
  optionalUrl,
} from "../records/index.ts";

const ok = <T>(value: T): FieldResult<T> => ({ ok: true, value });
const fail = (message: string): FieldResult<never> => ({ ok: false, message });

/** The record kinds a field can belong to. */
export const FIELD_ENTITIES = ["company", "contact", "deal"] as const;

export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export function isFieldEntity(value: string): value is FieldEntity {
  return FIELD_ENTITIES.some((entity) => entity === value);
}

/** How each entity reads in copy: "company", "Companies". */
export const ENTITY_NAMES = {
  company: { one: "company", many: "companies", title: "Companies" },
  contact: { one: "contact", many: "contacts", title: "Contacts" },
  deal: { one: "deal", many: "deals", title: "Deals" },
} as const satisfies Record<FieldEntity, { one: string; many: string; title: string }>;

/** Field types, in the order the type menu lists them. */
export const FIELD_TYPES = [
  { id: "text", label: "Text", hint: "Text — one line" },
  { id: "long_text", label: "Long text", hint: "Long text — paragraphs" },
  { id: "number", label: "Number", hint: "Number" },
  { id: "date", label: "Date", hint: "Date" },
  { id: "checkbox", label: "Checkbox", hint: "Checkbox — yes or no" },
  { id: "select", label: "Select", hint: "Select — one of a fixed list" },
  { id: "url", label: "Link", hint: "Link — a web address" },
  { id: "email", label: "Email", hint: "Email" },
  { id: "phone", label: "Phone", hint: "Phone" },
  { id: "user", label: "Member", hint: "Member — someone in the workspace" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["id"];

export function isFieldType(value: string): value is FieldType {
  return FIELD_TYPES.some((type) => type.id === value);
}

export function fieldTypeLabel(type: string) {
  return FIELD_TYPES.find((entry) => entry.id === type)?.label ?? type;
}

export const isFieldId = (value: string) => isRecordId(ID_PREFIXES.field_definition, value);
export const isFieldOptionId = (value: string) => isRecordId(ID_PREFIXES.field_option, value);
export const isFieldValueId = (value: string) => isRecordId(ID_PREFIXES.field_value, value);

export const MAX_LABEL = 80;
export const MAX_KEY = 48;
export const MAX_BRIEF = 1000;
export const MAX_OPTIONS = 100;

const collapse = (input: string) => input.trim().replaceAll(/\s+/g, " ");

/** A field's label: required, one line, at most 80 characters. */
export function normalizeFieldLabel(input: string): FieldResult<string> {
  const text = collapse(input);

  if (!text) return fail("Enter a label");

  return text.length > MAX_LABEL ? fail(`Keep it under ${MAX_LABEL} characters`) : ok(text);
}

export function fieldLabelError(input: string) {
  const result = normalizeFieldLabel(input);

  return result.ok ? undefined : result.message;
}

/** The agent brief: optional prose; blank is `null`. */
export function normalizeFieldBrief(input: string | null): FieldResult<string | null> {
  return optionalProse(input, MAX_BRIEF);
}

export function fieldBriefError(input: string) {
  const result = normalizeFieldBrief(input);

  return result.ok ? undefined : result.message;
}

/** A select option's label: required, one line, at most 80 characters. */
export function normalizeOptionLabel(input: string): FieldResult<string> {
  const text = collapse(input);

  if (!text) return fail("Name the option");

  return text.length > MAX_LABEL ? fail(`Keep it under ${MAX_LABEL} characters`) : ok(text);
}

/**
 * A select field's options: each normalised, blanks dropped, no two alike (ignoring case), at
 * least one and at most 100.
 */
export function normalizeOptionLabels(inputs: readonly string[]): FieldResult<string[]> {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (!collapse(input)) continue;

    const label = normalizeOptionLabel(input);

    if (!label.ok) return label;

    const folded = label.value.toLowerCase();

    if (seen.has(folded)) return fail(`"${label.value}" is listed twice`);

    seen.add(folded);
    labels.push(label.value);
  }

  if (labels.length === 0) return fail("Add at least one option");

  return labels.length > MAX_OPTIONS ? fail(`Keep it to ${MAX_OPTIONS} options`) : ok(labels);
}

export function optionLabelsError(inputs: readonly string[]) {
  const result = normalizeOptionLabels(inputs);

  return result.ok ? undefined : result.message;
}

/**
 * The key the API and the agent call a field by: its label in snake_case (`Lead source` →
 * `lead_source`), starting with a letter, at most 48 characters. When `taken` already has it,
 * a number is added (`lead_source_2`). Keys never change once saved.
 */
export function fieldKey(label: string, taken: Iterable<string> = []) {
  const used = new Set(taken);

  const base =
    label
      .normalize("NFKD")
      .replaceAll(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "")
      .replace(/^(\d)/, "field_$1")
      .slice(0, MAX_KEY)
      .replace(/_+$/, "") || "field";

  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const tail = `_${suffix}`;
    const key = `${base.slice(0, MAX_KEY - tail.length).replace(/_+$/, "")}${tail}`;

    if (!used.has(key)) return key;
  }
}

/** A value as the API takes it: text, a number, a flag, an option or member id, or `null`. */
export type FieldInput = string | number | boolean | null;

/** A value in its typed column, as stored. Exactly one column is set. */
export type StoredValue =
  | { readonly column: "text"; readonly value: string }
  | { readonly column: "number"; readonly value: string }
  | { readonly column: "date"; readonly value: string }
  | { readonly column: "bool"; readonly value: boolean }
  | { readonly column: "option_id"; readonly value: string }
  | { readonly column: "user_id"; readonly value: string };

/** The typed columns of a value row, as Electric syncs them. */
export interface ValueColumns {
  readonly text: string | null;
  readonly number: string | null;
  readonly date: string | null;
  readonly bool: boolean | null;
  readonly option_id: string | null;
  readonly user_id: string | null;
}

export const EMPTY_VALUE_COLUMNS: ValueColumns = {
  text: null,
  number: null,
  date: null,
  bool: null,
  option_id: null,
  user_id: null,
};

/** A stored value spread over every typed column (the others `null`). */
export function valueColumns(stored: StoredValue): ValueColumns {
  return { ...EMPTY_VALUE_COLUMNS, [stored.column]: stored.value };
}

/**
 * A number such as `42`, `1,250.5` or `-3`: stored as decimal text, at most 20 digits before
 * the point and 4 after.
 */
export function optionalNumber(input: string | number | null): FieldResult<string | null> {
  if (input === null) return ok(null);

  // A JSON number reads as its decimal text; `1e21` or `NaN` fail the pattern below.
  const text = String(input).trim().replaceAll(/[\s,]/g, "");

  if (!text) return ok(null);

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);

  if (!match) return fail("Enter a number");

  const whole = (match[2] ?? "").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");

  if (whole.length > 20) return fail("That number is too large");

  if (fraction.length > 4) return fail("Use at most 4 decimal places");

  const sign = match[1] === "-" && (whole !== "0" || fraction !== "") ? "-" : "";

  return ok(`${sign}${whole}${fraction ? `.${fraction}` : ""}`);
}

const asText = (input: FieldInput) => (input === null ? null : String(input));

/** `true`, `false`, `yes`, `no`, `1`, `0`; `null` or blank clears. */
function checkboxValue(input: FieldInput): FieldResult<boolean | null> {
  if (input === null || input === "") return ok(null);

  if (input === true || input === false) return ok(input);

  const text = String(input).trim().toLowerCase();

  if (["true", "yes", "1", "on"].includes(text)) return ok(true);

  if (["false", "no", "0", "off"].includes(text)) return ok(false);

  return fail("Choose yes or no");
}

const stored = (column: StoredValue["column"], value: string | null) =>
  // SAFETY: every column but `bool` holds text; the caller passes the matching value.
  ok(value === null ? null : ({ column, value } as StoredValue));

/**
 * Normalises a value for a field of `type`. `null` (or blank text) clears the value. Select and
 * member values are ids, checked for shape here; the API checks they belong to the field or the
 * workspace.
 */
export function normalizeFieldValue(
  type: FieldType,
  input: FieldInput,
): FieldResult<StoredValue | null> {
  const text = asText(input);

  const from = (result: FieldResult<string | null>, column: StoredValue["column"]) =>
    result.ok ? stored(column, result.value) : result;

  switch (type) {
    case "text":
      return from(optionalText(text, 500), "text");
    case "long_text":
      return from(optionalProse(text), "text");
    case "url":
      return from(optionalUrl(text), "text");
    case "email":
      return from(optionalEmail(text), "text");
    case "phone":
      return from(optionalPhone(text), "text");
    case "number":
      return from(optionalNumber(text), "number");
    case "date":
      return from(optionalDate(text), "date");
    case "checkbox": {
      const flag = checkboxValue(input);

      if (!flag.ok) return flag;

      return ok(flag.value === null ? null : { column: "bool", value: flag.value });
    }

    case "select": {
      const id = text?.trim() ?? "";

      if (!id) return ok(null);

      return isFieldOptionId(id) ? stored("option_id", id) : fail("Choose one of the options");
    }

    case "user": {
      const id = text?.trim() ?? "";

      return id ? stored("user_id", id) : ok(null);
    }
  }
}

/** A value's raw content from its typed columns, by the field's type. */
export function readFieldValue(type: string, row: ValueColumns): string | boolean | null {
  switch (type) {
    case "number":
      return row.number;
    case "date":
      return row.date;
    case "checkbox":
      return row.bool;
    case "select":
      return row.option_id;
    case "user":
      return row.user_id;
    default:
      return row.text;
  }
}

/** Who set a value last. */
export const VALUE_SETTERS = ["member", "agent"] as const;

export type ValueSetter = (typeof VALUE_SETTERS)[number];

/** A ready-made field a workspace adds with one click. */
export interface SuggestedField {
  readonly label: string;
  readonly type: FieldType;
  readonly options?: readonly string[];
  readonly brief?: string;
}

export const SUGGESTED_FIELDS = {
  company: [
    {
      label: "Account type",
      type: "select",
      options: ["Prospect", "Customer", "Partner", "Churned"],
    },
    { label: "Segment", type: "select", options: ["Enterprise", "Mid-Market", "SMB"] },
    { label: "Territory", type: "select", options: ["AMER", "EMEA", "APAC"] },
    {
      label: "Lifecycle stage",
      type: "select",
      options: ["Lead", "MQL", "SQL", "Opportunity", "Customer"],
    },
    { label: "Lead source", type: "select", options: ["Inbound", "Outbound", "Event"] },
    {
      label: "ICP fit score",
      type: "number",
      brief: "How well they fit our ideal customer, from 0 to 100.",
    },
    { label: "BDR owner", type: "user" },
  ],
  contact: [
    {
      label: "Persona",
      type: "select",
      options: ["Economic buyer", "Champion", "Technical evaluator", "End user"],
    },
    { label: "Lead source", type: "select", options: ["Inbound", "Outbound", "Event", "Referral"] },
    { label: "Do not contact", type: "checkbox" },
    { label: "Timezone", type: "text", brief: "Their working timezone, such as Europe/London." },
  ],
  deal: [
    { label: "Deal type", type: "select", options: ["New business", "Expansion", "Renewal"] },
    { label: "Forecast category", type: "select", options: ["Pipeline", "Best case", "Commit"] },
    { label: "Competitor", type: "text", brief: "The main alternative they are evaluating." },
    { label: "Next step", type: "long_text" },
  ],
} as const satisfies Record<FieldEntity, readonly SuggestedField[]>;

/** The built-in fields of each entity, which the fields settings list read-only. */
export const STANDARD_FIELDS = {
  company: COMPANY_FIELDS.map((field) => field.label),
  contact: CONTACT_FIELDS.map((field) => field.label),
  deal: [...DEAL_FIELDS.map((field) => field.label), "Stage"],
} as const satisfies Record<FieldEntity, readonly string[]>;

/** A custom field's column and facet id in a record table: `cf_<key>`. */
export const customColumnId = (key: string) => `cf_${key}` as const;
