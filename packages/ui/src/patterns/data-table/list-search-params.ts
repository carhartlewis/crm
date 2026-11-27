import {
  type GenericParserBuilder,
  parseAsInteger,
  parseAsJson,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
  type SingleParserBuilder,
} from "nuqs";
import { z } from "zod";

import { fieldFilterKey, type SortDirection, scopedKey } from "./table-query";

export const LIST_SEARCH_PARAM = {
  q: "q",
  sort: "sort",
  dir: "dir",
  page: "page",
  fields: "fields",
  expand: "expand",
  hide: "hide",
} as const;

const SORT_DIRECTIONS = ["asc", "desc"] as const;

type StringParser = SingleParserBuilder<string> & { defaultValue: string };

type ArrayParser = GenericParserBuilder<string[]> & { defaultValue: string[] };

const fieldFiltersSchema = z.record(z.string(), z.array(z.string()));

export type FieldFilters = z.infer<typeof fieldFiltersSchema>;

export const searchParsers = {
  [LIST_SEARCH_PARAM.q]: parseAsString.withDefault(""),
  [LIST_SEARCH_PARAM.page]: parseAsInteger.withDefault(1).withOptions({ history: "push" }),
  [LIST_SEARCH_PARAM.fields]: parseAsJson<FieldFilters>(fieldFiltersSchema).withDefault({}),
};

type DirParser = SingleParserBuilder<SortDirection> & {
  defaultValue: SortDirection;
};

type PageParser = SingleParserBuilder<number> & { defaultValue: number };

type FieldsParser = SingleParserBuilder<FieldFilters> & {
  defaultValue: FieldFilters;
};

export type ListParsers = {
  q: StringParser;
  sort: StringParser;
  dir: DirParser;
  page: PageParser;
  fields: FieldsParser;
  [id: string]: StringParser | ArrayParser | DirParser | PageParser | FieldsParser;
};

type ListSearchValues = {
  q: string;
  sort: string;
  dir: SortDirection;
  page: number;
  fields: FieldFilters;
  tab: string;
  facets: Record<string, string[]>;
};

export type ListInput<TTab extends string, TFacet extends string> = {
  q: string;
  sort: string;
  dir: SortDirection;
  page: number;
  pageSize: number;
  fields: FieldFilters;
} & { [K in TTab]: string } & { [K in TFacet]: string[] };

export type ListTableConfig<TTab extends string, TFacet extends string> = {
  scope?: string;
  defaultSort?: string;
  defaultDir?: SortDirection;
  pageSize?: number;
  tabId?: TTab;
  facetIds?: readonly TFacet[];
  facetDefaults?: Partial<Record<TFacet, string[]>>;
};

export type ListSearchParams<TTab extends string, TFacet extends string> = {
  config: ListTableConfig<TTab, TFacet> & {
    defaultSort: string;
    defaultDir: SortDirection;
    pageSize: number;
  };
  parsers: ListParsers;
  urlKeys: Record<string, string>;
  toInput: (values: ListSearchValues) => ListInput<TTab, TFacet>;
};

const LIST_SEARCH_PARAMS_OWNER = "createListSearchParams";

export type ReservedKeyCheck = (keys: readonly string[], owner: string) => void;

export function listUrlKeys(
  scope: string | undefined,
  keys: readonly string[],
): Record<string, string> {
  return scope ? Object.fromEntries(keys.map((key) => [key, scopedKey(scope, key)])) : {};
}

function assertDistinctFilterIds(filterIds: readonly string[]): void {
  const fieldFilterLookalikes = filterIds.filter((id) => fieldFilterKey(id) !== null);

  if (fieldFilterLookalikes.length > 0) {
    throw new Error(
      `[${LIST_SEARCH_PARAMS_OWNER}] tab and facet ids must not look like field filters: ${fieldFilterLookalikes.join(", ")}. Rename the id.`,
    );
  }

  const duplicates = [...new Set(filterIds.filter((id, index) => filterIds.indexOf(id) !== index))];

  if (duplicates.length > 0) {
    throw new Error(
      `[${LIST_SEARCH_PARAMS_OWNER}] tab and facet ids must be unique: ${duplicates.join(", ")}. Rename the id.`,
    );
  }
}

export function listSearchParamsFor(assertUnreserved: ReservedKeyCheck) {
  return function createListSearchParams<
    TTab extends string = never,
    TFacet extends string = never,
  >(config: ListTableConfig<TTab, TFacet> = {}): ListSearchParams<TTab, TFacet> {
    return listSearchParams(config, assertUnreserved);
  };
}

function listSearchParams<TTab extends string, TFacet extends string>(
  config: ListTableConfig<TTab, TFacet>,
  assertUnreserved: ReservedKeyCheck,
): ListSearchParams<TTab, TFacet> {
  const {
    scope,
    defaultSort = "",
    defaultDir = "asc",
    pageSize = 25,
    tabId,
    facetIds = [],
    facetDefaults,
  } = config;

  const filterIds = [...(tabId ? [tabId] : []), ...facetIds];

  assertUnreserved(filterIds, LIST_SEARCH_PARAMS_OWNER);
  assertDistinctFilterIds(filterIds);

  const tabExtras: Record<string, StringParser> = {};

  if (tabId) tabExtras[tabId] = parseAsString.withDefault("all");

  const facetExtras: Record<string, ArrayParser> = {};

  for (const id of facetIds) {
    facetExtras[id] = parseAsNativeArrayOf(parseAsString).withDefault(facetDefaults?.[id] ?? []);
  }

  const parsers = {
    ...searchParsers,
    [LIST_SEARCH_PARAM.sort]: parseAsString.withDefault(defaultSort),
    [LIST_SEARCH_PARAM.dir]: parseAsStringLiteral(SORT_DIRECTIONS).withDefault(defaultDir),
    ...tabExtras,
    ...facetExtras,
  } satisfies ListParsers;

  const urlKeys = listUrlKeys(scope, Object.keys(parsers));

  if (scope) {
    assertUnreserved(
      [
        ...Object.values(urlKeys),
        scopedKey(scope, LIST_SEARCH_PARAM.hide),
        scopedKey(scope, LIST_SEARCH_PARAM.expand),
      ],
      LIST_SEARCH_PARAMS_OWNER,
    );
  }

  const toInput = (values: ListSearchValues): ListInput<TTab, TFacet> => {
    const selectedTab: Record<string, string> = {};

    if (tabId) selectedTab[tabId] = values.tab;

    const selectedFacets: Record<string, string[]> = {};

    for (const id of facetIds) {
      selectedFacets[id] = values.facets[id] ?? facetDefaults?.[id] ?? [];
    }

    // SAFETY: selectedTab holds the tab under `tabId` when there is one, and
    // selectedFacets holds a list under every id in `facetIds`: exactly the
    // TTab and TFacet keys ListInput adds to the fixed ones.
    return {
      q: values.q.trim(),
      sort: values.sort,
      dir: values.dir,
      page: values.page > 0 ? values.page : 1,
      pageSize,
      fields: values.fields,
      ...selectedTab,
      ...selectedFacets,
    } as ListInput<TTab, TFacet>;
  };

  return {
    config: { ...config, defaultSort, defaultDir, pageSize },
    parsers,
    urlKeys,
    toInput,
  };
}

/**
 * `createListSearchParams` with no reserved keys. An app that owns other URL keys should build
 * its own with `listSearchParamsFor(itsReservedKeyCheck)` so a list can never take them.
 */
export const createListSearchParams = listSearchParamsFor(() => {});
