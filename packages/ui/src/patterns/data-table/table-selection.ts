export type Selection = ReadonlySet<string>;

export const EMPTY_SELECTION: Selection = new Set();

export function pageKeyOf(rowIds: readonly string[]): string {
  return rowIds.toSorted().join(" ");
}

export function keptOnPage(picked: Selection, rowIds: readonly string[]): Selection {
  if (picked.size === 0) return picked;

  const kept = new Set(rowIds.filter((id) => picked.has(id)));

  return kept.size === picked.size ? picked : kept;
}

export function withRow(picked: Selection, id: string, selected: boolean): Selection {
  return withRows(picked, [id], selected);
}

export function withRows(
  picked: Selection,
  rowIds: readonly string[],
  selected: boolean,
): Selection {
  const next = new Set(picked);

  for (const id of rowIds) {
    if (selected) next.add(id);
    else next.delete(id);
  }

  return next;
}

export type SelectionSummary = {
  ids: string[];
  count: number;
  allSelected: boolean;
  someSelected: boolean;
};

export function selectionSummary(picked: Selection, rowIds: readonly string[]): SelectionSummary {
  const ids = rowIds.filter((id) => picked.has(id));

  return {
    ids,
    count: ids.length,
    allSelected: rowIds.length > 0 && ids.length === rowIds.length,
    someSelected: ids.length > 0 && ids.length < rowIds.length,
  };
}
