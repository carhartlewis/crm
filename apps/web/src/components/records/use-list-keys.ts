import type { TableSelection } from "@crm/ui/patterns/data-table/use-table-selection";
import { useHotkeys } from "react-hotkeys-hook";
import {
  extend,
  first,
  last,
  type ListCursor,
  move,
  toggleActive,
} from "../../lib/list-navigation.ts";

/** The keyboard position in a list: the active row and where a ⇧-range started. */
export interface ListPosition {
  readonly activeId: string | null;
  readonly anchorId: string | null;
}

export const noPosition: ListPosition = { activeId: null, anchorId: null };

export interface ListKeysOptions {
  /** Row ids in display order (after filter and sort). */
  readonly ids: readonly string[];
  readonly position: ListPosition;
  readonly setPosition: (position: ListPosition) => void;
  /** The table's own selection: x and ⇧j/⇧k change it, as the checkboxes do. */
  readonly selection: TableSelection;
  /** Off while a sheet or dialog is open: derived from that state, so it can't drift. */
  readonly enabled: boolean;
  readonly onOpen: (id: string) => void;
  readonly onFilter: () => void;
}

/**
 * A record list's keys, Linear/Gmail style:
 * j k ↓ ↑ move · g g / ⇧G first / last · Enter or o open · x select · ⇧j ⇧k extend ·
 * Escape clear selection · / filter. Creating is global (⌘C, components/shell/shortcuts.tsx).
 * Plain keys never fire in text fields (react-hotkeys-hook's default).
 */
export function useListKeys({
  ids,
  position,
  setPosition,
  selection,
  enabled,
  onOpen,
  onFilter,
}: ListKeysOptions) {
  const options = { enabled, preventDefault: true };
  const cursor: ListCursor = { ...position, selected: new Set(selection.ids) };

  // Navigation only moves the position; selection changes go through the table's selection.
  const go = (next: ListCursor) =>
    setPosition({ activeId: next.activeId, anchorId: next.anchorId });

  const select = (next: ListCursor) => {
    for (const id of ids) {
      const wanted = next.selected.has(id);

      if (wanted !== selection.has(id)) selection.toggle(id, wanted);
    }

    go(next);
  };

  useHotkeys("j, down", () => go(move(cursor, ids, 1)), options, [cursor, ids]);
  useHotkeys("k, up", () => go(move(cursor, ids, -1)), options, [cursor, ids]);
  useHotkeys("g>g", () => go(first(cursor, ids)), options, [cursor, ids]);
  useHotkeys("shift+g", () => go(last(cursor, ids)), options, [cursor, ids]);
  useHotkeys("shift+j, shift+down", () => select(extend(cursor, ids, 1)), options, [cursor, ids]);
  useHotkeys("shift+k, shift+up", () => select(extend(cursor, ids, -1)), options, [cursor, ids]);
  useHotkeys("x", () => select(toggleActive(cursor)), options, [cursor, ids]);
  useHotkeys("escape", () => selection.clear(), { enabled: enabled && selection.count > 0 }, [
    selection,
  ]);
  useHotkeys(
    "enter, o",
    () => {
      if (position.activeId !== null) onOpen(position.activeId);
    },
    options,
    [position.activeId, onOpen],
  );
  useHotkeys("slash", onFilter, options, [onFilter]);
}
