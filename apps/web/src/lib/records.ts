import { sheetStackParser, sheetUrl } from "@crm/ui/patterns/record-sheet/sheet-params";
import { type SheetStack, useSheetStack } from "@crm/ui/patterns/record-sheet/use-sheet-stack";
import { useState } from "react";

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
  contact: ["overview", "deals", "activity", "agent", "knowledge"],
  deal: ["overview", "contacts", "activity", "agent", "knowledge"],
} as const satisfies { [K in RecordKind]: readonly [string, ...string[]] };

export type RecordTab<K extends RecordKind> = (typeof RECORD_TABS)[K][number];

const recordSheets = sheetStackParser(RECORD_TABS);

export const isRecordKind = (kind: string): kind is RecordKind =>
  RECORD_KINDS.some((other) => other === kind);

/** The stack of open record sheets in the URL, bottom first. */
export function useRecordStack() {
  return useSheetStack(recordSheets);
}

const isTabOf = <K extends RecordKind>(kind: K, tab: string): tab is RecordTab<K> =>
  RECORD_TABS[kind].some((other) => other === tab);

/**
 * The record the shell's sheet shows: the top of the stack, or while the last sheet closes, the
 * record it showed, so the sheet slides out with its content.
 */
export function useShownRecord(stack: SheetStack) {
  const top = stack.entries.at(-1);
  const [last, setLast] = useState(top);

  if (top && (top.kind !== last?.kind || top.id !== last.id || top.tab !== last.tab)) {
    setLast(top);
  }

  return top ?? last;
}

/**
 * One kind's sheet: open while the top of the sheet stack is a record of this kind. `close`
 * returns to the sheet it was opened from, or to the page. While the last sheet closes, `id`
 * and `tab` keep the record it showed.
 */
export function useRecordSheet<K extends RecordKind>(kind: K) {
  const stack = useRecordStack();
  const top = stack.entries.at(-1);
  const shown = useShownRecord(stack);
  const mine = shown?.kind === kind ? shown : undefined;
  const first: RecordTab<K> = RECORD_TABS[kind][0];

  return {
    id: mine?.id ?? null,
    tab: mine && isTabOf(kind, mine.tab) ? mine.tab : first,
    /** Whether this kind's sheet is the one showing. */
    isOpen: top?.kind === kind,
    /** Whether any record sheet is open, of this kind or another. */
    anyOpen: top !== undefined,
    /** Opens a record on its own, as from its list. */
    open: (id: string) => stack.open({ kind, id, tab: first }),
    setTab: (tab: RecordTab<K>) => stack.setTab(tab),
    close: () => {
      if (top?.kind === kind) stack.pop();
    },
  };
}

/**
 * Opens a record's sheet over the current page, on `tab` when given, else its first tab. From
 * another sheet it opens on top: closing it (or Back) returns to the sheet it was opened from.
 */
export function useOpenRecord() {
  const stack = useRecordStack();

  return <K extends RecordKind>(kind: K, id: string, tab?: RecordTab<K>) =>
    stack.push({ kind, id, tab: tab ?? RECORD_TABS[kind][0] });
}

/** A link to a page with one record's sheet open, such as a toast's "View". */
export function recordUrl(base: string, kind: RecordKind, id: string) {
  return sheetUrl(base, recordSheets, [{ kind, id, tab: RECORD_TABS[kind][0] }]);
}
