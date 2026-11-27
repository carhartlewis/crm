import { ListSearch } from "./list-search";
import { useFitRows } from "./use-fit-rows";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import type { ReactNode } from "react";

import { type SortableColumn, SortableTable } from "./sortable-table";
import { useTabQuery } from "./tab-query";

const UNMEASURED_PAGE_SIZE = 25;

export function matchesSearch(search: string, text: string) {
  const haystack = text.toLowerCase();

  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function FittedTable<TRow>({
  scope,
  searchPlaceholder,
  label,
  columns,
  rows,
  getRowId,
  haystack,
  empty,
  action,
  onRowClick,
  rowActions,
  groupBy,
}: {
  groupBy?: (row: TRow) => string;
  action?: ReactNode;
  onRowClick?: (row: TRow) => void;
  rowActions?: (row: TRow) => ReactNode;
  scope: string;
  searchPlaceholder: string;
  label: string;
  columns: SortableColumn<TRow>[];
  rows: TRow[];
  getRowId: (row: TRow) => string;
  haystack: (row: TRow) => string;
  empty: string;
}) {
  const query = useTabQuery(scope);
  const fit = useFitRows(UNMEASURED_PAGE_SIZE);

  const shown = rows.filter((row) => matchesSearch(query.search, haystack(row)));

  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {action ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="wide-slot min-w-0 flex-1">
            <ListSearch placeholder={searchPlaceholder} scope={scope} />
          </div>
          {action}
        </div>
      ) : (
        <ListSearch placeholder={searchPlaceholder} scope={scope} />
      )}
      <div className="min-h-0 min-w-0 flex-1" ref={fit.ref}>
        <SortableTable
          columns={columns}
          empty={query.search ? UI_COPY.noMatchingResults : empty}
          getRowId={getRowId}
          groupBy={groupBy}
          label={label}
          onRowClick={onRowClick}
          pageSize={fit.rows}
          rowActions={rowActions}
          rows={shown}
          scope={scope}
        />
      </div>
    </div>
  );
}

export function CodeCell({ children }: { children: string }) {
  return (
    <span className="block truncate font-mono text-label text-muted-foreground">{children}</span>
  );
}
