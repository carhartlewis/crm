import { StaticTable, type StaticTableColumn, useHiddenColumns } from "./data-table";
import { LOCALE } from "@crm/ui/patterns/ui-copy";
import type { ReactNode } from "react";

import { groupedPages, groupRows } from "./grouped-pages";
import { type RowSort, sortRows } from "./sort-rows";
import { useTabQuery } from "./tab-query";

export type SortableColumn<TRow> = Omit<StaticTableColumn<TRow>, "sortable"> & {
  sortBy: RowSort<TRow> | null;
};

export function SortableTable<TRow>({
  scope,
  label,
  columns,
  rows,
  getRowId,
  empty,
  pageSize,
  onRowClick,
  rowActions,
  groupBy,
  compactEmpty,
}: {
  groupBy?: (row: TRow) => string;
  compactEmpty?: boolean;
  scope: string;
  label: string;
  columns: SortableColumn<TRow>[];
  rows: readonly TRow[];
  getRowId: (row: TRow) => string;
  empty: ReactNode;
  pageSize?: number;
  onRowClick?: (row: TRow) => void;
  rowActions?: (row: TRow) => ReactNode;
}) {
  const query = useTabQuery(scope);

  const columnsMenu = useHiddenColumns({
    scope,
    columnsKey: scope,
    columns,
  });

  const order = columns.find((column) => column.id === query.sort)?.sortBy;

  const groups = groupBy ? groupRows(rows, groupBy) : [rows];

  const sorted = groups.flatMap((group) =>
    order ? sortRows(group, order, query.dir, LOCALE) : group,
  );

  const size = pageSize ?? Math.max(1, sorted.length);

  const pages = groupBy && pageSize ? groupedPages(sorted, size, groupBy) : undefined;

  const lastPage = Math.max(1, pages?.length ?? Math.ceil(sorted.length / size));

  const page = Math.min(Math.max(1, query.page), lastPage);

  const groupPage = pages?.[page - 1];

  const visible = groupPage?.rows ?? sorted.slice((page - 1) * size, page * size);

  return (
    <StaticTable
      columns={columns.map((column) => ({
        ...column,
        sortable: column.sortBy !== null,
        hideable: column.hideable ?? column.kind !== "title",
      }))}
      columnsMenu={columnsMenu}
      compactEmpty={compactEmpty}
      empty={empty}
      getRowId={getRowId}
      groupBy={groupBy}
      label={label}
      onRowClick={onRowClick}
      paging={
        pageSize
          ? {
              page,
              pageSize,
              total: sorted.length,
              totalPages: lastPage,
              start: groupPage?.start,
              count: visible.length,
              onPageChange: query.setPage,
            }
          : undefined
      }
      rowActions={rowActions}
      rows={visible}
      sort={{ sort: query.sort, dir: query.dir, onToggle: query.toggleSort }}
    />
  );
}
