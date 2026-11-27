import { rankSearch } from "@crm/ui/lib/search-rank";

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

  // Search ranks like ⌘K (`rankSearch`): typos and words in any order still match, and each
  // matching row keeps its tier, so better matches come first and the sort applies within a tier.
  const tierOf = (() => {
    if (input.q.trim() === "") return null;

    const ranked = rankSearch(
      rows.map((row) => ({ row, label: haystack(row), section: "" })),
      input.q,
    );

    return new Map(ranked.map(({ item, tier }) => [item.row, tier]));
  })();

  const byTier = (left: TRow, right: TRow) =>
    tierOf ? (tierOf.get(left) ?? 0) - (tierOf.get(right) ?? 0) : 0;

  const visible = (() => {
    const readSort = isSortKey(sortValues, input.sort) ? sortValues[input.sort] : undefined;

    const direction = input.dir === "desc" ? -1 : 1;

    const filtered = rows.filter((row) => {
      if (where && !where(row)) {
        return false;
      }

      if (tierOf && !tierOf.has(row)) {
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
      return groupOf || tierOf
        ? filtered.toSorted((left, right) => byGroup(left, right) || byTier(left, right))
        : filtered;
    }

    return filtered.toSorted((left, right) => {
      const first = byGroup(left, right) || byTier(left, right);

      if (first !== 0) {
        return first;
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
