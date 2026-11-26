import type { SortDirection } from "./table-query";

export type RowSort<TRow> = {
  isEmpty: (row: TRow) => boolean;
  compare: (left: TRow, right: TRow, collator: Intl.Collator) => number;
};

export function byText<TRow>(read: (row: TRow) => string | null | undefined): RowSort<TRow> {
  return {
    isEmpty: (row) => !read(row),
    compare: (left, right, collator) => collator.compare(read(left) ?? "", read(right) ?? ""),
  };
}

export function byNumber<TRow>(read: (row: TRow) => number | null): RowSort<TRow> {
  return {
    isEmpty: (row) => read(row) === null,
    compare: (left, right) => (read(left) ?? 0) - (read(right) ?? 0),
  };
}

export function byDate<TRow>(read: (row: TRow) => string | null): RowSort<TRow> {
  return byNumber((row) => {
    const value = read(row);

    return value === null ? null : Date.parse(value);
  });
}

export function byFlag<TRow>(read: (row: TRow) => boolean): RowSort<TRow> {
  return byNumber((row) => Number(read(row)));
}

export function sortRows<TRow>(
  rows: readonly TRow[],
  order: RowSort<TRow>,
  dir: SortDirection,
  locale: string,
): TRow[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });

  const direction = dir === "desc" ? -1 : 1;

  return rows.toSorted((left, right) => {
    const leftEmpty = order.isEmpty(left);
    const rightEmpty = order.isEmpty(right);

    if (leftEmpty || rightEmpty) {
      return Number(leftEmpty) - Number(rightEmpty);
    }

    return order.compare(left, right, collator) * direction;
  });
}
