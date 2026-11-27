import { useQueryState } from "nuqs";
import {
  poppedSheet,
  pushedSheet,
  SHEET_PARAM,
  type SheetEntry,
  type SheetStackParser,
  withTopTab,
} from "./sheet-params";

export type SheetStack = {
  /** The open sheets, bottom first; the last one shows. */
  readonly entries: readonly SheetEntry[];
  /** Opens one sheet on its own, as from a list: a new history entry. */
  readonly open: (entry: SheetEntry) => void;
  /** Opens a sheet over the open ones (from a sheet, ⌘K or a chat): a new history entry. */
  readonly push: (entry: SheetEntry) => void;
  /** Closes the top sheet and shows the one it was opened from: a new history entry. */
  readonly pop: () => void;
  /** Switches the top sheet's tab in place. */
  readonly setTab: (tab: string) => void;
};

/** The stack of open record sheets in the URL (`?sheet=`); see `sheetStackParser`. */
export function useSheetStack(parser: SheetStackParser): SheetStack {
  const [entries, setEntries] = useQueryState(SHEET_PARAM, parser);

  return {
    entries,
    open: (entry) => void setEntries([entry], { history: "push" }),
    push: (entry) => void setEntries((current) => pushedSheet(current, entry), { history: "push" }),
    pop: () => void setEntries(poppedSheet, { history: "push" }),
    setTab: (tab) => void setEntries((current) => withTopTab(current, tab), { history: "replace" }),
  };
}
