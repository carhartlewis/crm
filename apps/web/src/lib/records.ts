import { RECORD_TAB_PARAM } from "@crm/ui/patterns/record-sheet/sheet-params";
import { parseAsString, useQueryStates } from "nuqs";

/**
 * Every kind of CRM record that has a sheet. A sheet opens from anywhere through its URL key
 * (`?company=<id>`), so record sheets are mounted once in the shell. Adding a kind here fails
 * type checking until it has a sheet (`components/shell/record-sheets.tsx`) and a ⌘K search
 * source (`lib/record-search.ts`).
 */
export const RECORD_KINDS = ["company"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** Each kind's sheet tabs; the first is the default, left out of the URL. */
export const RECORD_TABS = {
  company: ["overview", "knowledge"],
} as const satisfies { [K in RecordKind]: readonly [string, ...string[]] };

/** Each kind's URL key holds the open record's id. */
const idParsers = {
  company: parseAsString,
} satisfies { [K in RecordKind]: typeof parseAsString };

/**
 * Opens a record's sheet over the current page, as a new history entry (Back closes it), on
 * `tab` when given (one of `RECORD_TABS[kind]`), else its first tab.
 */
export function useOpenRecord() {
  const [, setRecords] = useQueryStates(
    { ...idParsers, [RECORD_TAB_PARAM]: parseAsString },
    { history: "push" },
  );

  return <K extends RecordKind>(kind: K, id: string, tab?: (typeof RECORD_TABS)[K][number]) =>
    setRecords({
      [kind]: id,
      [RECORD_TAB_PARAM]: tab === undefined || tab === RECORD_TABS[kind][0] ? null : tab,
    });
}
