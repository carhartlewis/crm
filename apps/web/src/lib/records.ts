import { sheetStackParser, sheetUrl } from "@crm/ui/patterns/record-sheet/sheet-params";
import { useSheetStack } from "@crm/ui/patterns/record-sheet/use-sheet-stack";

/**
 * Every kind of CRM record that has a sheet. A sheet opens from anywhere through the sheet stack
 * in the URL (`?sheet=company:<id>`), so record sheets are mounted once in the shell. Adding a
 * kind here fails type checking until it has a sheet (`components/shell/record-sheets.tsx`) and
 * a ⌘K search source (`lib/record-search.ts`).
 */
export const RECORD_KINDS = ["company", "contact", "deal"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** Each kind's sheet tabs; the first is the default, left out of the URL. */
export const RECORD_TABS = {
  company: ["overview", "contacts", "deals", "activity", "agent", "knowledge"],
  contact: ["overview", "deals", "activity", "agent"],
  deal: ["overview", "contacts", "activity", "agent"],
} as const satisfies { [K in RecordKind]: readonly [string, ...string[]] };

export type RecordTab<K extends RecordKind> = (typeof RECORD_TABS)[K][number];

const recordSheets = sheetStackParser(RECORD_TABS);

const isTabOf = <K extends RecordKind>(kind: K, tab: string): tab is RecordTab<K> =>
  RECORD_TABS[kind].some((other) => other === tab);

/**
 * One kind's sheet: open while the top of the sheet stack is a record of this kind. `close`
 * returns to the sheet it was opened from, or to the page.
 */
export function useRecordSheet<K extends RecordKind>(kind: K) {
  const stack = useSheetStack(recordSheets);
  const top = stack.entries.at(-1);
  const mine = top?.kind === kind ? top : undefined;
  const first: RecordTab<K> = RECORD_TABS[kind][0];

  return {
    id: mine?.id ?? null,
    tab: mine && isTabOf(kind, mine.tab) ? mine.tab : first,
    /** Whether any record sheet is open, of this kind or another. */
    anyOpen: top !== undefined,
    /** Opens a record on its own, as from its list. */
    open: (id: string) => stack.open({ kind, id, tab: first }),
    setTab: (tab: RecordTab<K>) => stack.setTab(tab),
    close: () => {
      if (mine) stack.pop();
    },
  };
}

/**
 * Opens a record's sheet over the current page, on `tab` when given, else its first tab. From
 * another sheet it opens on top: closing it (or Back) returns to the sheet it was opened from.
 */
export function useOpenRecord() {
  const stack = useSheetStack(recordSheets);

  return <K extends RecordKind>(kind: K, id: string, tab?: RecordTab<K>) =>
    stack.push({ kind, id, tab: tab ?? RECORD_TABS[kind][0] });
}

/** A link to a page with one record's sheet open, such as a toast's "View". */
export function recordUrl(base: string, kind: RecordKind, id: string) {
  return sheetUrl(base, recordSheets, [{ kind, id, tab: RECORD_TABS[kind][0] }]);
}
