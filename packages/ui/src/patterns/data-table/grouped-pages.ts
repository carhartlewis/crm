type GroupedPage<TRow> = { start: number; rows: TRow[] };

export function groupedPages<TRow>(
  rows: readonly TRow[],
  capacity: number,
  groupBy: (row: TRow) => string,
) {
  const pages: GroupedPage<TRow>[] = [];
  const size = Math.max(2, capacity);
  let page: GroupedPage<TRow> = { start: 0, rows: [] };
  let used = 0;
  let previous = "";

  for (const [index, row] of rows.entries()) {
    const group = groupBy(row);
    let cost = 1 + Number(Boolean(group) && group !== previous);

    if (used + cost > size) {
      pages.push(page);
      page = { start: index, rows: [] };
      used = 0;
      cost = 1 + Number(Boolean(group));
    }

    page.rows.push(row);
    used += cost;
    previous = group;
  }

  if (page.rows.length > 0) pages.push(page);

  return pages;
}

export function groupRows<TRow>(rows: readonly TRow[], groupBy: (row: TRow) => string) {
  const groups: TRow[][] = [];
  let previousGroup: string | undefined;

  for (const row of rows) {
    const key = groupBy(row);
    const group = groups.at(-1);

    if (group && key === previousGroup) group.push(row);
    else groups.push([row]);

    previousGroup = key;
  }

  return groups;
}
