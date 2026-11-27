import type { FieldFilters } from "./list-search-params";

export type SortDirection = "asc" | "desc";

type TableFilters = Record<string, string[]>;

export type TableQueryState = {
  sort: string;
  dir: SortDirection;
  page: number;
  pageSize: number;
  tab: string;
  tabId?: string;
  scope?: string;
  filters: TableFilters;
  toggleSort: (id: string) => void;
  setSort: (id: string) => void;
  setDir: (dir: SortDirection) => void;
  setPage: (page: number) => Promise<void>;
  setTab: (value: string) => void;
  setFilter: (id: string, values: string[]) => void;
};

const FIELD_FILTER_PREFIX = "field:";

export function scopedKey(scope: string | undefined, key: string): string {
  return scope ? `${scope}-${key}` : key;
}

export function currentPage(rawPage: number): number {
  return rawPage > 0 ? rawPage : 1;
}

export type SortUpdate =
  | { dir: SortDirection; page: 1 }
  | { sort: string; dir: SortDirection; page: 1 };

export function sortToggle(
  current: { sort: string; dir: SortDirection },
  id: string,
  defaultDir: SortDirection,
): SortUpdate {
  if (current.sort !== id) return { sort: id, dir: defaultDir, page: 1 };

  return { dir: current.dir === "asc" ? "desc" : "asc", page: 1 };
}

export function fieldFilterKey(filterId: string): string | null {
  return filterId.startsWith(FIELD_FILTER_PREFIX)
    ? filterId.slice(FIELD_FILTER_PREFIX.length)
    : null;
}

export function fieldFiltersWith(
  fields: FieldFilters,
  key: string,
  selected: string[],
): FieldFilters {
  const others: FieldFilters = Object.fromEntries(
    Object.entries(fields).filter(([name]) => name !== key),
  );

  return selected.length === 0 ? others : { ...others, [key]: selected };
}

export function tableFilters({
  tabId,
  tab,
  facets,
  fields,
}: {
  tabId: string | undefined;
  tab: string;
  facets: Record<string, string[]>;
  fields: FieldFilters;
}): TableFilters {
  return Object.fromEntries<string[]>([
    ...(tabId ? [[tabId, [tab]] satisfies [string, string[]]] : []),
    ...Object.entries(facets),
    ...Object.entries(fields).map(
      ([key, selected]) => [`${FIELD_FILTER_PREFIX}${key}`, selected] satisfies [string, string[]],
    ),
  ]);
}
