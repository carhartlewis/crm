import type { Nullable, Values } from "nuqs";
import { useQueryStates } from "nuqs";
import { z } from "zod";

import type { ListInput, ListParsers, ListSearchParams } from "./list-search-params";
import {
  currentPage,
  fieldFilterKey,
  fieldFiltersWith,
  sortToggle,
  type TableQueryState,
  tableFilters,
} from "./table-query";

export type TableQuery<TTab extends string, TFacet extends string = never> = {
  query: TableQueryState;
  input: ListInput<TTab, TFacet>;
};

type ListValues = Values<ListParsers>;

type ListUpdate = Partial<Nullable<ListValues>>;

const tabValue = z.string().catch("");

type ListValue = ListValues[string] | null | undefined;

function asStringArray(value: ListValue): string[] {
  return Array.isArray(value) ? value : [];
}

export function useTableQuery<TTab extends string, TFacet extends string>(
  searchParams: ListSearchParams<TTab, TFacet>,
): TableQuery<TTab, TFacet> {
  const { parsers, config, urlKeys, toInput } = searchParams;
  const { defaultDir, pageSize, tabId, facetIds, scope } = config;

  const [values, setState] = useQueryStates(parsers, { urlKeys });

  function setValues(update: ListUpdate): Promise<void> {
    return setState(update).then(() => undefined);
  }

  const { q, sort, fields } = values;
  const dir = values.dir === "desc" ? "desc" : "asc";
  const rawPage = values.page;
  const page = currentPage(rawPage);
  const tab = tabId ? tabValue.parse(values[tabId]) : "all";

  const facets: Record<string, string[]> = Object.fromEntries(
    (facetIds ?? []).map((id) => [id, asStringArray(values[id])]),
  );

  const filters = tableFilters({ tabId, tab, facets, fields });

  const query: TableQueryState = {
    sort,
    dir,
    page,
    pageSize,
    tab,
    tabId,
    scope,
    filters,
    toggleSort: (id) => {
      void setState((old) => sortToggle(old, id, defaultDir));
    },
    setSort: (id) => void setValues({ sort: id, page: 1 }),
    setDir: (nextDir) => void setValues({ dir: nextDir, page: 1 }),
    setPage: (next) => setValues({ page: next }),
    setTab: (value) => {
      if (!tabId) return;
      void setValues({ [tabId]: value, page: 1 });
    },
    setFilter: (id, selected) => {
      const key = fieldFilterKey(id);

      void setValues(
        key === null
          ? { [id]: selected, page: 1 }
          : { fields: fieldFiltersWith(fields, key, selected), page: 1 },
      );
    },
  };

  const input = toInput({ q, sort, dir, page: rawPage, fields, tab, facets });

  return { query, input };
}
