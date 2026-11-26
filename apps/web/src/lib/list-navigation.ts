/**
 * Keyboard navigation over an ordered list of record ids, as pure functions: the active row
 * (j/k, g g, G), and selection (x toggles; ⇧j/⇧k extend from an anchor). Ids that vanish (a
 * filter, a delete) are dropped; the active row falls back to the nearest remaining row.
 */
export interface ListCursor {
  readonly activeId: string | null;
  /** Where a ⇧-extended range starts: the row active when extending began. */
  readonly anchorId: string | null;
  readonly selected: ReadonlySet<string>;
}

export const emptyCursor: ListCursor = { activeId: null, anchorId: null, selected: new Set() };

function indexOf(ids: readonly string[], id: string | null) {
  return id === null ? -1 : ids.indexOf(id);
}

/** The cursor reconciled with the current rows. */
export function reconcile(
  cursor: ListCursor,
  ids: readonly string[],
  previousIds: readonly string[] = ids,
): ListCursor {
  const present = new Set(ids);
  const selected = new Set([...cursor.selected].filter((id) => present.has(id)));
  let activeId = cursor.activeId;

  if (activeId !== null && !present.has(activeId)) {
    // The row went away: stay at the same position, clamped to the end.
    const position = Math.min(Math.max(previousIds.indexOf(activeId), 0), ids.length - 1);

    activeId = ids[position] ?? null;
  }

  const anchorId =
    cursor.anchorId !== null && present.has(cursor.anchorId) ? cursor.anchorId : null;

  return { activeId, anchorId, selected };
}

/** Moves the active row by `delta` (clamped). With no active row, down starts at the top, up at the bottom. */
export function move(cursor: ListCursor, ids: readonly string[], delta: number): ListCursor {
  if (ids.length === 0) return cursor;

  const index = indexOf(ids, cursor.activeId);

  const next =
    index < 0
      ? delta > 0
        ? 0
        : ids.length - 1
      : Math.min(Math.max(index + delta, 0), ids.length - 1);

  return { ...cursor, activeId: ids[next] ?? null, anchorId: null };
}

export function first(cursor: ListCursor, ids: readonly string[]): ListCursor {
  return { ...cursor, activeId: ids[0] ?? null, anchorId: null };
}

export function last(cursor: ListCursor, ids: readonly string[]): ListCursor {
  return { ...cursor, activeId: ids.at(-1) ?? null, anchorId: null };
}

/** x: toggles the active row's selection. */
export function toggleActive(cursor: ListCursor): ListCursor {
  if (cursor.activeId === null) return cursor;

  const selected = new Set(cursor.selected);

  if (selected.has(cursor.activeId)) selected.delete(cursor.activeId);
  else selected.add(cursor.activeId);

  return { ...cursor, selected, anchorId: cursor.activeId };
}

/**
 * ⇧j / ⇧k: moves the active row and selects everything between the anchor and it, keeping
 * rows selected outside that range (like Gmail and Linear).
 */
export function extend(cursor: ListCursor, ids: readonly string[], delta: number): ListCursor {
  const moved = move(cursor, ids, delta);
  const anchorId = cursor.anchorId ?? cursor.activeId ?? moved.activeId;
  const from = indexOf(ids, anchorId);
  const to = indexOf(ids, moved.activeId);

  if (from < 0 || to < 0) return moved;

  const [start, end] = from < to ? [from, to] : [to, from];
  const selected = new Set(cursor.selected);

  for (const id of ids.slice(start, end + 1)) selected.add(id);

  return { activeId: moved.activeId, anchorId, selected };
}

export function clearSelection(cursor: ListCursor): ListCursor {
  return { ...cursor, selected: new Set(), anchorId: null };
}
