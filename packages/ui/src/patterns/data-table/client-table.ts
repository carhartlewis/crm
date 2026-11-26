export type ClientTableInput = {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

type FacetCounts<TFacet extends string> = Partial<Record<TFacet, Record<string, number>>>;

type FacetReader<TRow> = (row: TRow) => string | string[];

export type SortValues<TRow, TColumn extends string = string> = Partial<
  Record<TColumn, (row: TRow) => string | number>
>;

function isSortKey<TRow, TColumn extends string>(
  sortValues: SortValues<TRow, TColumn>,
  key: string,
): key is TColumn {
  return Object.hasOwn(sortValues, key);
}

export type ClientTableResult<TRow, TFacet extends string> = {
  visible: TRow[];
  rows: TRow[];
  facetCounts: FacetCounts<TFacet>;
  total: number;
};

export function clientTable<TRow, TFacet extends string, TColumn extends string = string>({
  rows,
  input,
  haystack,
  sortValues,
  facetOf,
  tieBreak,
  groupOf,
  where,
}: {
  rows: readonly TRow[];
  input: ClientTableInput & Record<NoInfer<TFacet>, string[]>;
  haystack: (row: TRow) => string;
  sortValues: SortValues<TRow, TColumn>;
  facetOf: Record<TFacet, FacetReader<TRow>>;
  tieBreak?: (left: TRow, right: TRow) => number;
  groupOf?: (row: TRow) => number;
  where?: (row: TRow) => boolean;
}): ClientTableResult<TRow, TFacet> {
  const isFacet = (key: string): key is TFacet => Object.hasOwn(facetOf, key);
  const facetNames = Object.keys(facetOf).filter(isFacet);

  const facetCounts = (() => {
    const counts: FacetCounts<TFacet> = {};

    for (const name of facetNames) {
      counts[name] = {};
    }

    for (const row of rows) {
      for (const name of facetNames) {
        const bucket = counts[name] ?? {};

        for (const value of asList(facetOf[name](row))) {
          bucket[value] = (bucket[value] ?? 0) + 1;
        }

        counts[name] = bucket;
      }
    }

    return counts;
  })();

  const byGroup = (left: TRow, right: TRow) => (groupOf ? groupOf(left) - groupOf(right) : 0);

  const visible = (() => {
    const needle = input.q.trim().toLowerCase();

    const readSort = isSortKey(sortValues, input.sort) ? sortValues[input.sort] : undefined;

    const direction = input.dir === "desc" ? -1 : 1;

    const filtered = rows.filter((row) => {
      if (where && !where(row)) {
        return false;
      }

      if (needle.length > 0 && !haystack(row).toLowerCase().includes(needle)) {
        return false;
      }

      for (const name of facetNames) {
        const chosen = input[name];

        if (
          chosen.length > 0 &&
          !asList(facetOf[name](row)).some((value) => chosen.includes(value))
        ) {
          return false;
        }
      }

      return true;
    });

    if (!readSort) {
      return groupOf ? filtered.toSorted(byGroup) : filtered;
    }

    return filtered.toSorted((left, right) => {
      const group = byGroup(left, right);

      if (group !== 0) {
        return group;
      }

      const a = readSort(left);
      const b = readSort(right);

      if (a === b) {
        return tieBreak?.(left, right) ?? 0;
      }

      return (a < b ? -1 : 1) * direction;
    });
  })();

  const lastPage = Math.max(1, Math.ceil(visible.length / input.pageSize));
  const page = Math.min(Math.max(1, input.page), lastPage);
  const start = (page - 1) * input.pageSize;

  return {
    visible,
    rows: visible.slice(start, start + input.pageSize),
    facetCounts,
    total: visible.length,
  };
}

function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
