import { RECORD_TAB_PARAM } from "@crm/ui/patterns/record-sheet/sheet-params";
import { parseAsString, useQueryStates } from "nuqs";

/**
 * Every kind of CRM record that has a sheet. A sheet opens from anywhere through its URL key
 * (`?company=<id>`), so record sheets are mounted once in the shell. Adding a kind here fails
 * type checking until it has a sheet (`components/shell/record-sheets.tsx`) and a ⌘K search
 * source (`lib/record-search.ts`).
 */
export const RECORD_KINDS = ["company", "contact", "deal"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** Each kind's sheet tabs; the first is the default, left out of the URL. */
export const RECORD_TABS = {
  company: ["overview", "contacts", "deals", "activity", "agent", "knowledge"],
  contact: ["overview", "deals", "activity", "agent"],
  deal: ["overview", "contacts", "activity", "agent"],
} as const satisfies { [K in RecordKind]: readonly [string, ...string[]] };

/** Each kind's URL key holds the open record's id. */
const idParsers = {
  company: parseAsString,
  contact: parseAsString,
  deal: parseAsString,
} satisfies { [K in RecordKind]: typeof parseAsString };

/**
 * Opens a record's sheet over the current page, as a new history entry (Back closes it, or
 * returns to the sheet it was opened from), on `tab` when given (one of `RECORD_TABS[kind]`),
 * else its first tab. One sheet shows at a time: opening a contact from a company's sheet
 * replaces it.
 */
export function useOpenRecord() {
  const [, setRecords] = useQueryStates(
    { ...idParsers, [RECORD_TAB_PARAM]: parseAsString },
    { history: "push" },
  );

  return <K extends RecordKind>(kind: K, id: string, tab?: (typeof RECORD_TABS)[K][number]) =>
    setRecords({
      ...Object.fromEntries(RECORD_KINDS.map((other) => [other, null])),
      [kind]: id,
      [RECORD_TAB_PARAM]: tab === undefined || tab === RECORD_TABS[kind][0] ? null : tab,
    });
}
