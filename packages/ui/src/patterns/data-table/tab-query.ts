import { LIST_SEARCH_PARAM, listUrlKeys, searchParsers } from "./list-search-params";
import { sortToggle } from "./table-query";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const SORT_DIRECTIONS = ["asc", "desc"] as const;

export const tabQueryParsers = {
  [LIST_SEARCH_PARAM.q]: searchParsers.q,
  [LIST_SEARCH_PARAM.page]: searchParsers.page,
  [LIST_SEARCH_PARAM.sort]: parseAsString.withDefault(""),
  [LIST_SEARCH_PARAM.dir]: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
};

export const TAB_QUERY_KEYS = [
  LIST_SEARCH_PARAM.q,
  LIST_SEARCH_PARAM.page,
  LIST_SEARCH_PARAM.sort,
  LIST_SEARCH_PARAM.dir,
] as const;

const CLEARED_TAB_QUERY = { q: null, page: null, sort: null, dir: null };

export function tabQueryKeys(scope: string): string[] {
  return Object.values(listUrlKeys(scope, [...TAB_QUERY_KEYS, LIST_SEARCH_PARAM.hide]));
}

export function useTabQuery(scope: string) {
  const [{ q, page, sort, dir }, setQuery] = useQueryStates(tabQueryParsers, {
    urlKeys: listUrlKeys(scope, TAB_QUERY_KEYS),
  });

  return {
    search: q.trim(),
    page,
    sort,
    dir,
    setPage: (next: number) => void setQuery({ page: next }),
    toggleSort: (columnId: string) => void setQuery(sortToggle({ sort, dir }, columnId, "asc")),
    restart: () => void setQuery({ q: null, page: null }),
    clear: () => void setQuery(CLEARED_TAB_QUERY),
  };
}

export function useClearTabQueries(scopes: readonly string[]) {
  const keys = scopes.flatMap(tabQueryKeys);

  const [, setQueries] = useQueryStates(
    Object.fromEntries(keys.map((key) => [key, parseAsString])),
  );

  return () => void setQueries(Object.fromEntries(keys.map((key) => [key, null])));
}
