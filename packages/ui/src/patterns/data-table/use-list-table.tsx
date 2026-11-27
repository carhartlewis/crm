import { isString } from "@crm/ui/lib/guards";
import type { DataTableFacetCounts, DataTableTabs } from "./data-table";
import { ListSearch, NoSearchMatch } from "./list-search";
import type { ListInput, ListSearchParams } from "./list-search-params";
import { TableCount } from "./table-cells";
import { TableEmpty } from "./table-empty";
import type { TableQueryState } from "./table-query";
import { useFitRows } from "./use-fit-rows";
import { useTableQuery } from "./use-table-query";
import { type TableSelection, useTableSelection } from "./use-table-selection";
import type { ReactNode, Ref } from "react";

import { clientTable, type SortValues } from "./client-table";
import { type TableView, tableViews } from "./table-views";

export type ListTableOptions<
  TRow,
  TTab extends string,
  TFacet extends string,
  TColumn extends string = string,
> = {
  searchParams: ListSearchParams<TTab, TFacet>;
  rows: readonly TRow[];
  loading: boolean;
  getRowId: (row: TRow) => string;
  haystack: (row: TRow) => string;
  sortValues: SortValues<TRow, TColumn>;
  facetOf: Record<TFacet, (row: TRow) => string | string[]>;
  tieBreak?: (left: TRow, right: TRow) => number;
  groupOf?: (row: TRow) => number;
  views?: {
    items: readonly TableView<TRow>[];
    label: string;
    allLabel: string;
  };
  tableId: string;
  noun: string;
  searchPlaceholder: string;
  blank?: {
    title: string;
    description: string;
    action?: ReactNode;
    busy?: boolean;
  };
  filtered: string | ((tab: string) => string);
};

export type ListTable<TRow, TTab extends string, TFacet extends string> = {
  input: ListInput<TTab, TFacet>;
  visible: TRow[];
  selection: TableSelection;
  /** Turns to the page that holds the row, so keyboard navigation never leaves the screen. */
  reveal: (id: string | null) => void;
  tableProps: {
    query: TableQueryState;
    fitRef: Ref<HTMLDivElement>;
    rows: TRow[];
    total: number;
    getRowId: (row: TRow) => string;
    loading: boolean;
    columnsKey: string;
    facetCounts: DataTableFacetCounts;
    tabs?: DataTableTabs;
    meta: ReactNode;
    search: ReactNode;
    empty: ReactNode;
  };
};

export function useListTable<
  TRow,
  TTab extends string = never,
  TFacet extends string = never,
  TColumn extends string = string,
>({
  searchParams,
  rows: all,
  loading,
  getRowId,
  haystack,
  sortValues,
  facetOf,
  tieBreak,
  groupOf,
  views: viewConfig,
  tableId,
  noun,
  searchPlaceholder,
  blank,
  filtered,
}: ListTableOptions<TRow, TTab, TFacet, TColumn>): ListTable<TRow, TTab, TFacet> {
  const { query: urlQuery, input: urlInput } = useTableQuery(searchParams);
  const { tabId, scope, pageSize: unmeasured } = searchParams.config;
  // A page is as many rows as fit the table's box; the configured size is only the first guess.
  const fit = useFitRows(unmeasured);
  const query: TableQueryState = { ...urlQuery, pageSize: fit.rows };
  const input = { ...urlInput, pageSize: fit.rows };
  const tab = tabId ? input[tabId] : "all";

  const views = tableViews(viewConfig?.items ?? [], all, tab);

  const table = clientTable({
    rows: all,
    input,
    haystack,
    sortValues,
    facetOf,
    tieBreak,
    groupOf,
    where: views.where,
  });

  const selection = useTableSelection(table.rows.map(getRowId));

  const facetCounts: DataTableFacetCounts = {
    ...table.facetCounts,
  };

  if (tabId && viewConfig) {
    facetCounts[tabId] = views.counts;
  }

  const search = input.q.trim();

  const empty =
    blank && all.length === 0 ? (
      <TableEmpty
        action={blank.action}
        busy={blank.busy}
        description={blank.description}
        title={blank.title}
      />
    ) : search ? (
      <NoSearchMatch noun={noun} query={search} scope={scope} />
    ) : isString(filtered) ? (
      filtered
    ) : (
      filtered(tab)
    );

  const reveal = (id: string | null) => {
    const index = id === null ? -1 : table.visible.findIndex((row) => getRowId(row) === id);

    if (index < 0) return;

    const page = Math.floor(index / fit.rows) + 1;

    if (page !== query.page) void query.setPage(page);
  };

  return {
    input,
    visible: table.visible,
    selection,
    reveal,
    tableProps: {
      query,
      fitRef: fit.ref,
      rows: table.rows,
      total: table.total,
      getRowId,
      loading,
      facetCounts,
      tabs:
        tabId && viewConfig
          ? {
              id: tabId,
              label: viewConfig.label,
              allLabel: viewConfig.allLabel,
              options: views.options,
            }
          : undefined,
      meta: <TableCount noun={noun} shown={table.total} total={all.length} />,
      search: <ListSearch placeholder={searchPlaceholder} scope={scope} />,
      empty,
      columnsKey: scope ? `${scope}-${tableId}` : tableId,
    },
  };
}
