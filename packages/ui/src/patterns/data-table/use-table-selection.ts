import { useState } from "react";

import {
  EMPTY_SELECTION,
  keptOnPage,
  pageKeyOf,
  type Selection,
  type SelectionSummary,
  selectionSummary,
  withRow,
  withRows,
} from "./table-selection";

export type TableSelection = SelectionSummary & {
  has: (id: string) => boolean;
  toggle: (id: string, selected: boolean) => void;
  toggleAll: (selected: boolean) => void;
  clear: () => void;
};

export function useTableSelection(rowIds: string[]): TableSelection {
  const [picked, setPicked] = useState<Selection>(EMPTY_SELECTION);
  const pageKey = pageKeyOf(rowIds);
  const [syncedKey, setSyncedKey] = useState(pageKey);

  if (syncedKey !== pageKey) {
    setSyncedKey(pageKey);
    setPicked((prev) => keptOnPage(prev, rowIds));
  }

  return {
    ...selectionSummary(picked, rowIds),
    has: (id) => picked.has(id),
    toggle: (id, selected) => setPicked((prev) => withRow(prev, id, selected)),
    toggleAll: (selected) => setPicked((prev) => withRows(prev, rowIds, selected)),
    clear: () => setPicked(EMPTY_SELECTION),
  };
}
