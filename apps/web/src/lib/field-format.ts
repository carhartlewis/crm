import { readFieldValue, type ValueColumns } from "@crm/core/fields";
import { calendarDate } from "./record-format.ts";

/** What a field needs to show its value: its type, and its options' labels for selects. */
export interface ShownField {
  readonly type: string;
}

/**
 * A custom field's value as text, for table cells and sorting: an option's label, a member's
 * name, "Yes"/"No", a formatted date or number. `null` when the record has none.
 */
export function fieldText(
  field: ShownField,
  value: ValueColumns | undefined,
  optionLabel: (id: string) => string | null,
  memberName: (id: string) => string | null,
): string | null {
  if (!value) return null;

  const raw = readFieldValue(field.type, value);

  if (raw === null) return null;

  switch (field.type) {
    case "checkbox":
      return raw === true ? "Yes" : "No";
    case "select":
      return optionLabel(String(raw));
    case "user":
      return memberName(String(raw));
    case "date":
      return calendarDate(String(raw));
    case "number": {
      const number = Number(raw);

      return Number.isFinite(number)
        ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(number)
        : String(raw);
    }

    default:
      return String(raw);
  }
}

/** A field's sort key: numbers sort as numbers, everything else as its shown text. */
export function fieldSortValue(
  field: ShownField,
  value: ValueColumns | undefined,
  text: string | null,
): string | number {
  if (field.type === "number" && value?.number) return Number(value.number);

  if (field.type === "date") return value?.date ?? "";

  return text?.toLowerCase() ?? "";
}

/**
 * A field's filter value on one record: the option or member id, `yes`/`no`, or `none` when the
 * record has no value (so "None" filters for blanks).
 */
export function fieldFacetValue(field: ShownField, value: ValueColumns | undefined) {
  if (!value) return "none";

  const raw = readFieldValue(field.type, value);

  if (raw === null) return "none";

  if (field.type === "checkbox") return raw === true ? "yes" : "no";

  return String(raw);
}

/** Field types a table offers as a filter: ones with a short, fixed set of values. */
export const FILTERABLE_TYPES: ReadonlySet<string> = new Set(["select", "user", "checkbox"]);
