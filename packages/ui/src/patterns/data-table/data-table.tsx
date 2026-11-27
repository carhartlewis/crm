import arrowDown16 from "@carbon/icons/es/arrow--down/16.js";
import arrowUp16 from "@carbon/icons/es/arrow--up/16.js";
import arrowsVertical16 from "@carbon/icons/es/arrows--vertical/16.js";
import catalog16 from "@carbon/icons/es/catalog/16.js";
import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import chevronRight16 from "@carbon/icons/es/chevron--right/16.js";
import filter16 from "@carbon/icons/es/filter/16.js";
import settings16 from "@carbon/icons/es/settings/16.js";
import { cn } from "cn";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@crm/ui/components/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm/ui/components/table";
import { carbonIcon } from "@crm/ui/components/icon";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { isString } from "@crm/ui/lib/guards";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import { SkeletonLine } from "@crm/ui/patterns/skeleton-lines";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useId,
  useState,
  useSyncExternalStore,
} from "react";

import { type ColumnKind, type ColumnLayout, columnLayout, orderColumns } from "./column-kinds";
import { LIST_SEARCH_PARAM } from "./list-search-params";
import { useOverflowTooltip } from "./overflow-tooltip";
import {
  parseStoredColumns,
  readStoredColumns,
  resolveHiddenColumns,
  subscribeStoredColumns,
  writeStoredColumns,
} from "./stored-columns";
import { TablePagination } from "./table-pagination";
import { type SortDirection, scopedKey, type TableQueryState } from "./table-query";
import type { TableSelection } from "./use-table-selection";

const ArrowDown = carbonIcon(arrowDown16);
const ArrowUp = carbonIcon(arrowUp16);
const ArrowsVertical = carbonIcon(arrowsVertical16);
const Catalog = carbonIcon(catalog16);
const ChevronDown = carbonIcon(chevronDown16);
const ChevronRight = carbonIcon(chevronRight16);
const Filter = carbonIcon(filter16);
const Settings = carbonIcon(settings16);

export type DataTableColumn<TRow, TColumn extends string = string> = {
  id: TColumn;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  kind: ColumnKind;
  label?: string;
  sortable?: boolean;
  hideable?: boolean;
  defaultHidden?: boolean;
};

export type DataTableFacetCounts = Partial<Record<string, Record<string, number>>>;

export type DataTableFacet = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  searchable?: boolean;
  search?: string;
  onSearchChange?: (search: string) => void;
  more?: string;
  onMore?: () => void;
  stale?: boolean;
  empty?: ReactNode;
};

type DataTableViews = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export type DataTableTabs = {
  id: string;
  label?: string;
  allLabel?: string;
  options: { value: string; label: string }[];
};

type DataTableExpandable<TRow, TSub> = {
  isExpandable: (row: TRow) => boolean;
  getSubRows: (row: TRow) => TSub[];
  getSubRowId: (sub: TSub, row: TRow) => string;
  renderSubCell: (sub: TSub, columnId: string, row: TRow) => ReactNode;
  onSubRowClick?: (sub: TSub, row: TRow) => void;
};

type DataTableSelection<TRow> = {
  state: TableSelection;
  actions: ReactNode;
  rowLabel?: (row: TRow) => string;
};

export type DataTableProps<TRow, TSub, TColumn extends string = string> = {
  query: TableQueryState;
  columns: DataTableColumn<TRow, TColumn>[];
  getRowId: (row: TRow) => string;
  rows: TRow[];
  total: number;
  facetCounts?: DataTableFacetCounts;
  loading?: boolean;
  facets?: DataTableFacet[];
  tabs?: DataTableTabs;
  views?: DataTableViews;
  onRowClick?: (row: TRow) => void;
  rowDisabled?: (row: TRow) => boolean;
  onRowHover?: (row: TRow) => void;
  expandable?: DataTableExpandable<TRow, TSub>;
  selection?: DataTableSelection<TRow>;
  rowActions?: (row: TRow) => ReactNode;
  /**
   * The row that keyboard navigation points at (the caller owns the bindings). It renders with
   * `data-active` and scrolls into view, nearest edge, whenever it changes.
   */
  activeRowId?: string | null;
  columnsKey?: string;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  search?: ReactNode;
  /**
   * Where `search` sits on wide screens. `end` (default) keeps Filters and Sort on the left, so
   * their menus and submenus open rightward with room to spare. Use `start` when `search` carries
   * leading controls of its own, such as tabs.
   */
  searchPosition?: "start" | "end";
  meta?: ReactNode;
  empty?: ReactNode;
  groupHeader?: (row: TRow, previous: TRow | undefined) => ReactNode;
  headingsWhenEmpty?: boolean;
  compactEmpty?: boolean;
  className?: string;
};

function layoutAttributes(column: { kind: ColumnKind }) {
  return {
    "data-kind": column.kind,
    "data-align": columnLayout(column.kind).align,
    "data-max-width": columnLayout(column.kind).maxWidth,
  };
}

const COLUMN_LAYOUT_CLASS = cn(
  "data-[kind=progress]:w-80 data-[align=right]:text-right data-[align=right]:tabular-nums",
  "data-[max-width=24]:max-w-24 data-[max-width=32]:max-w-32 data-[max-width=36]:max-w-36 data-[max-width=44]:max-w-44 data-[max-width=56]:max-w-56 data-[max-width=80]:max-w-80 data-[max-width=144]:max-w-144",
);

const COLUMN_CONTENT_CLASS = cn(
  "min-w-0 data-[kind=title]:min-w-40",
  "data-[kind=progress]:w-72 data-[kind=progress]:max-w-72",
);

function ColumnContent({ kind, children }: { kind: ColumnKind; children: ReactNode }) {
  return (
    <div className={COLUMN_CONTENT_CLASS} data-kind={kind}>
      {children === null || children === undefined || children === false || children === "" ? (
        <EmptyCellDash />
      ) : (
        children
      )}
    </div>
  );
}

const COLUMN_HEAD_CLASS = cn(
  "h-11 overflow-hidden px-4 font-medium text-label text-muted-foreground",
  COLUMN_LAYOUT_CLASS,
);

const COLUMN_CELL_CLASS = cn("overflow-hidden px-4", COLUMN_LAYOUT_CLASS);

const ROW_ACCENT = "cursor-pointer";

const ROW_ACCENT_EXPANDABLE = "cursor-pointer";

/** The keyboard-active row: a clear tint plus an inset bar on its first cell. */
const ROW_ACTIVE = cn(
  "data-active:bg-accent/60 data-active:hover:bg-accent/60",
  "data-active:*:first:shadow-active-row",
);

/**
 * Callback ref for the keyboard-active row. React attaches it to the newly active row and detaches
 * it from the old one, so it runs exactly once per change of `activeRowId` (no effect needed).
 */
function revealActiveRow(row: HTMLTableRowElement | null) {
  row?.scrollIntoView({ block: "nearest" });
}

const TABLE_CLASS = cn(
  "w-full table-auto border-separate border-spacing-0",
  "[&_td]:border-b [&_th]:border-b [&_tbody>tr:last-child>td]:border-b-0",
  "[&_tfoot>tr:first-child>td]:border-t [&_tfoot>tr:last-child>td]:border-b-0",
  "[&_tr]:transition-none [&_tbody>tr]:h-12",
  "[&_th:has([role=checkbox])+th]:pl-1 [&_td:has([role=checkbox])+td]:pl-1",
);

const END_COLUMN_CLASS = cn(
  "sticky right-0 z-1 w-10 min-w-10 max-w-10 whitespace-nowrap bg-card px-1 text-center pinned-end-edge",
  "[tbody>tr:hover>&]:bg-linear-to-r [tbody>tr:hover>&]:from-muted/50 [tbody>tr:hover>&]:to-muted/50",
  "[tbody>tr:has([aria-expanded=true])>&]:bg-linear-to-r [tbody>tr:has([aria-expanded=true])>&]:from-muted/50 [tbody>tr:has([aria-expanded=true])>&]:to-muted/50",
  "[tbody>tr[data-state=selected]>&]:bg-muted",
  "[tbody>tr[data-active]>&]:bg-linear-to-r [tbody>tr[data-active]>&]:from-accent/60 [tbody>tr[data-active]>&]:to-accent/60",
);

const TABLE_CONTAINER_CLASS = "min-h-0 overflow-auto rounded-md bg-card shadow-hairline";

const TABLE_EMPTY_MIN_HEIGHT_CLASS = "min-h-80";

const TABLE_COMPACT_EMPTY_MIN_HEIGHT_CLASS = "min-h-40";

const TABLE_HEADER_CLASS = "sticky top-0 z-10 bg-card select-none [&_th]:bg-card";

function TableFrame({
  overlay,
  label,
  compact = false,
  children,
}: {
  overlay: ReactNode;
  label?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the handlers only record whether the pointer or the keyboard is in use (data-pointer); they act on nothing.
    <section
      aria-label={label}
      className={cn(
        "relative w-full outline-none [&>[data-slot=table-container]]:overflow-visible",
        TABLE_CONTAINER_CLASS,
        overlay && (compact ? TABLE_COMPACT_EMPTY_MIN_HEIGHT_CLASS : TABLE_EMPTY_MIN_HEIGHT_CLASS),
      )}
      data-slot="table-frame"
      onKeyUp={(event) => {
        if (event.key === "Tab") delete event.currentTarget.dataset.pointer;
      }}
      onPointerDown={(event) => {
        event.currentTarget.dataset.pointer = "";
      }}
    >
      {children}
      {overlay}
    </section>
  );
}

const TABLE_EMPTY_OVERLAY_CLASS =
  "absolute inset-0 flex items-center justify-center px-4 py-8 text-center text-muted-foreground";

const LOADING_ROW_COUNT = 5;

function skeletonWidth({ kind }: { kind: ColumnKind }, fitted: boolean) {
  if (kind === "action") return "24";

  if (fitted && (kind === "title" || kind === "detail")) return "48";

  return "two-thirds";
}

function LoadingRows({
  columns,
  selectable = false,
  expandable = false,
  endColumn = false,
  fitted = false,
  rows = LOADING_ROW_COUNT,
}: {
  columns: { id: string; kind: ColumnKind }[];
  selectable?: boolean;
  expandable?: boolean;
  endColumn?: boolean;
  fitted?: boolean;
  rows?: number;
}) {
  const rowKeys = Array.from({ length: rows }, (_, index) => `loading-${index}`);

  return rowKeys.map((rowKey) => (
    <TableRow className="hover:bg-transparent" data-slot="table-loading-row" key={rowKey}>
      {selectable ? <TableCell className="w-12 min-w-12 max-w-12 px-0 text-center py-3" /> : null}
      {expandable ? <TableCell className="w-12 min-w-12 max-w-12 px-0 text-center py-3" /> : null}
      {columns.map((column) => (
        <TableCell
          key={column.id}
          {...layoutAttributes(column)}
          className={cn(COLUMN_CELL_CLASS, "py-3")}
        >
          <div
            className="flex min-h-5 flex-col justify-center data-[align=right]:items-end"
            data-align={columnLayout(column.kind).align}
          >
            <SkeletonLine width={skeletonWidth(column, fitted)} />
          </div>
        </TableCell>
      ))}

      {endColumn ? <TableCell className={END_COLUMN_CLASS} /> : null}
    </TableRow>
  ));
}

function ColumnHeader({ column }: { column: { kind: ColumnKind; header: ReactNode } }) {
  if (column.kind === "action") {
    return <span className="sr-only">{column.header}</span>;
  }

  return column.header;
}

function columnLabel(column: MenuColumn): string {
  if (column.label) return column.label;

  return isString(column.header) ? column.header : column.id;
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDirection }) {
  return (
    <span className="text-muted-foreground">
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowsVertical className="size-3 opacity-0 transition-opacity group-hover/button:opacity-40 group-focus-visible/button:opacity-40" />
      )}
    </span>
  );
}

function ariaSort(active: boolean, dir: SortDirection): "ascending" | "descending" | undefined {
  if (!active) return undefined;

  return dir === "asc" ? "ascending" : "descending";
}

function SortHeader({
  children,
  active,
  align,
  dir,
  onToggle,
}: {
  children: ReactNode;
  active: boolean;
  align: ColumnLayout["align"];
  dir: SortDirection;
  onToggle: () => void;
}) {
  return (
    <Button
      className={cn(
        "-ml-2 font-medium text-label text-muted-foreground",
        align === "right" && "-mr-2 ml-0 flex-row-reverse",
      )}
      onClick={onToggle}
      size="xs"
      type="button"
      variant="ghost"
    >
      {children}
      <SortIndicator active={active} dir={dir} />
    </Button>
  );
}

function toggle(selected: string[], value: string, checked: boolean): string[] {
  return checked ? [...selected, value] : selected.filter((v) => v !== value);
}

function FacetCount({ counts, value }: { counts?: Record<string, number>; value: string }) {
  if (counts === undefined) {
    return null;
  }

  return (
    <span className="ml-2 shrink-0 text-label text-muted-foreground tabular-nums">
      {counts[value] ?? 0}
    </span>
  );
}

function FacetSubmenu({
  facet,
  selected,
  counts,
  onChange,
}: {
  facet: DataTableFacet;
  selected: string[];
  counts?: Record<string, number>;
  onChange: (values: string[]) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{facet.label}</span>
        {selected.length > 0 && (
          <span className="tabular-nums opacity-60">({selected.length})</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className={cn("max-h-72 min-w-52 overflow-hidden", facet.searchable && "p-0")}
        sideOffset={4}
      >
        {facet.searchable ? (
          <Command shouldFilter={facet.onSearchChange === undefined} className="max-h-72">
            <CommandInput
              placeholder={UI_COPY.searchFacet(facet.label)}
              value={facet.search}
              onValueChange={facet.onSearchChange}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <CommandEmpty>{facet.empty ?? UI_COPY.facetEmpty}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {facet.options.map((option) => {
                  const checked = selected.includes(option.value);

                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      disabled={facet.stale}
                      data-checked={checked}
                      onSelect={() => onChange(toggle(selected, option.value, !checked))}
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="flex-1 truncate">{option.label}</span>
                      <FacetCount counts={counts} value={option.value} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {facet.more && facet.onMore ? (
                <CommandGroup>
                  <CommandItem
                    value={`${facet.id}-more`}
                    disabled={facet.stale}
                    onSelect={facet.onMore}
                  >
                    <span className="flex-1 truncate font-medium">{facet.more}</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        ) : (
          <div className="max-h-72 overflow-y-auto overflow-x-hidden">
            {selected.length > 0 && (
              <>
                <DropdownMenuItem onClick={() => onChange([])}>{UI_COPY.clear}</DropdownMenuItem>
                <DropdownMenuSeparator className="mx-0" />
              </>
            )}
            {facet.options.map((option) => {
              const checked = selected.includes(option.value);

              return (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={checked}
                  closeOnClick={false}
                  onCheckedChange={(next) => onChange(toggle(selected, option.value, next))}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  <FacetCount counts={counts} value={option.value} />
                </DropdownMenuCheckboxItem>
              );
            })}
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ReturnToPage({
  page,
  setPage,
}: {
  page: number;
  setPage: (page: number) => Promise<void>;
}) {
  useMountEffect(() => {
    void setPage(page);
  });

  return null;
}

function SelectionBar<TRow>({
  selection,
  selecting,
}: {
  selection: DataTableSelection<TRow>;
  selecting: boolean;
}) {
  return (
    <div
      aria-hidden={!selecting}
      className={cn(
        "col-start-1 row-start-1 flex h-8 items-center gap-2 self-start select-none",
        !selecting && "invisible",
      )}
      inert={!selecting}
    >
      <span className="truncate text-label text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{selection.state.count}</span>{" "}
        {UI_COPY.selected}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {selection.actions}
        <Button variant="ghost" size="sm" onClick={() => selection.state.clear()}>
          {UI_COPY.clear}
        </Button>
      </div>
    </div>
  );
}

export function CellControl({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center">
      {"\u200B"}
      {children}
    </span>
  );
}

type HiddenColumnsSource = {
  id: string;
  defaultHidden?: boolean;
};

export type HiddenColumns = {
  hidden: readonly string[];
  setColumnShown: (columnId: string, shown: boolean) => void;
};

export function useHiddenColumns({
  scope,
  columnsKey,
  columns,
}: {
  scope: string | undefined;
  columnsKey: string | undefined;
  columns: readonly HiddenColumnsSource[];
}): HiddenColumns {
  const defaultHiddenIds: string[] = columns
    .filter((column) => column.defaultHidden)
    .map((column) => column.id);

  const [hiddenInUrl, setHiddenInUrl] = useQueryState(
    scopedKey(scope, LIST_SEARCH_PARAM.hide),
    parseAsArrayOf(parseAsString),
  );

  const storedHidden = parseStoredColumns(
    useSyncExternalStore(
      subscribeStoredColumns,
      () => (columnsKey ? readStoredColumns(columnsKey) : null),
      () => null,
    ),
  );

  const hidden = resolveHiddenColumns({
    fromUrl: hiddenInUrl,
    stored: storedHidden,
    defaults: defaultHiddenIds,
  });

  const setColumnShown = (columnId: string, shown: boolean) => {
    const set = new Set(hidden);

    if (shown) set.delete(columnId);
    else set.add(columnId);

    const next = [...set];

    if (columnsKey) writeStoredColumns(columnsKey, next);

    const isDefault =
      next.length === defaultHiddenIds.length && next.every((id) => defaultHiddenIds.includes(id));

    void setHiddenInUrl(isDefault ? null : next);
  };

  return { hidden, setColumnShown };
}

type MenuColumn = {
  id: string;
  header: ReactNode;
  label?: string;
};

function EndColumnHeader({
  columns,
  hidden,
  onShownChange,
  rowActions,
}: {
  columns: readonly MenuColumn[];
  hidden: readonly string[];
  onShownChange: (columnId: string, shown: boolean) => void;
  rowActions: boolean;
}) {
  if (columns.length === 0) {
    return rowActions ? <span className="sr-only">{UI_COPY.rowActions}</span> : null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={UI_COPY.toggleColumns}
            className="-my-1 text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Settings />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{UI_COPY.toggleColumns}</DropdownMenuLabel>
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={!hidden.includes(column.id)}
              closeOnClick={false}
              onCheckedChange={(checked) => onShownChange(column.id, checked)}
            >
              {columnLabel(column)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTable<TRow, TSub = unknown, TColumn extends string = string>({
  query,
  columns: givenColumns,
  getRowId,
  rows,
  total,
  facetCounts,
  loading,
  facets,
  tabs,
  views,
  onRowClick,
  rowDisabled,
  onRowHover,
  expandable,
  selection,
  rowActions,
  activeRowId,
  columnsKey,
  actions,
  leadingActions,
  search,
  searchPosition = "end",
  meta,
  empty,
  groupHeader,
  headingsWhenEmpty = false,
  compactEmpty = false,
  className,
}: DataTableProps<TRow, TSub, TColumn>) {
  const columns = orderColumns(givenColumns);

  const [expandedIds, setExpandedIds] = useQueryState(
    scopedKey(query.scope, LIST_SEARCH_PARAM.expand),
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const expanded = new Set(expandedIds);

  const { hidden, setColumnShown } = useHiddenColumns({
    scope: query.scope,
    columnsKey,
    columns,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();

  const hideable = columns.filter((column) => column.hideable !== false);

  const visibleColumns = columns.filter((column) => !hidden.includes(column.id));

  const sortableColumns = columns.filter((column) => column.sortable);

  const tabCounts = tabs ? facetCounts?.[tabs.id] : undefined;

  const activeTabOption =
    query.tab === "all" ? undefined : tabs?.options.find((option) => option.value === query.tab);

  const activeTabLabel = activeTabOption ? activeTabOption.label : (tabs?.allLabel ?? UI_COPY.all);

  const anyExpandable = expandable != null && rows.some((row) => expandable.isExpandable(row));

  const selecting = selection != null && selection.state.count > 0;

  const pageSize = query.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageIsPastEnd = !loading && query.page > totalPages;

  const availableFacets = (facets ?? []).filter(
    (facet) =>
      facet.options.length > 0 || facet.searchable || (query.filters[facet.id]?.length ?? 0) > 0,
  );

  const activeViewLabel = views?.options.find((option) => option.value === views.value)?.label;

  const hasFilterControls =
    tabs != null ||
    views != null ||
    availableFacets.length > 0 ||
    sortableColumns.length > 0 ||
    anyExpandable ||
    actions != null ||
    leadingActions != null;

  const activeFacetFilterCount = availableFacets.filter(
    (facet) => (query.filters[facet.id]?.length ?? 0) > 0,
  ).length;

  const activeFilterCount = (tabs && query.tab !== "all" ? 1 : 0) + activeFacetFilterCount;

  const overflow = useOverflowTooltip();

  const quiet = !loading && total === 0 && activeFilterCount === 0;

  return (
    <div className={cn("@container/table flex min-h-0 flex-1 flex-col gap-3", className)}>
      {pageIsPastEnd ? (
        <ReturnToPage key={totalPages} page={totalPages} setPage={query.setPage} />
      ) : null}
      <div className="grid">
        {selection ? <SelectionBar selecting={selecting} selection={selection} /> : null}
        <div
          aria-hidden={selecting}
          className={cn(
            "col-start-1 row-start-1 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
            selecting && "invisible",
          )}
          inert={selecting}
        >
          {search != null && (
            <div className={cn(searchPosition === "end" && "lg:order-last lg:ml-auto")}>
              {search}
            </div>
          )}
          {hasFilterControls && (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between sm:hidden"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <Filter />
                {UI_COPY.tableOptions}
                {activeFilterCount > 0 && (
                  <span className="tabular-nums opacity-60">({activeFilterCount})</span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  "shrink-0 opacity-60 transition-transform",
                  filtersOpen && "rotate-180",
                )}
              />
            </Button>
          )}
          <div
            id={filtersId}
            className={cn("flex-col gap-2 lg:contents", filtersOpen ? "flex" : "hidden sm:flex")}
          >
            {leadingActions}

            {quiet ? (
              actions
            ) : (
              <div
                className={cn(
                  "grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center",
                  searchPosition === "start" && "lg:ml-auto",
                )}
              >
                {tabs && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start sm:justify-center"
                        />
                      }
                    >
                      <Catalog data-icon="inline-start" />
                      {tabs.label ?? UI_COPY.view}
                      <span className="truncate opacity-60">{activeTabLabel}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-52">
                      <DropdownMenuRadioGroup
                        value={query.tab}
                        onValueChange={(value) => query.setTab(String(value))}
                      >
                        <DropdownMenuRadioItem value="all">
                          <span className="flex-1">{tabs.allLabel ?? UI_COPY.all}</span>
                        </DropdownMenuRadioItem>
                        {tabs.options.map((option) => {
                          if (tabCounts?.[option.value] === 0) return null;

                          return (
                            <DropdownMenuRadioItem key={option.value} value={option.value}>
                              <span className="flex-1">{option.label}</span>
                            </DropdownMenuRadioItem>
                          );
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {views && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="outline" className="justify-start sm:justify-center" />
                      }
                    >
                      <Catalog data-icon="inline-start" />
                      {views.label}
                      {activeViewLabel && (
                        <span className="truncate opacity-60">{activeViewLabel}</span>
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-48">
                      <DropdownMenuRadioGroup
                        onValueChange={(value) => views.onChange(String(value))}
                        value={views.value}
                      >
                        <DropdownMenuLabel>{views.label}</DropdownMenuLabel>
                        {views.options.map((option) => (
                          <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {availableFacets.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="outline" className="justify-start sm:justify-center" />
                      }
                    >
                      <Filter data-icon="inline-start" />
                      {UI_COPY.filters}
                      {activeFacetFilterCount > 0 && (
                        <span className="tabular-nums opacity-60">({activeFacetFilterCount})</span>
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-48">
                      {availableFacets.map((facet) => (
                        <FacetSubmenu
                          key={facet.id}
                          counts={facetCounts?.[facet.id]}
                          facet={facet}
                          selected={query.filters[facet.id] ?? []}
                          onChange={(values) => query.setFilter(facet.id, values)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {(sortableColumns.length > 0 || anyExpandable) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="outline" className="justify-start sm:justify-center" />
                      }
                    >
                      <ArrowsVertical data-icon="inline-start" />
                      {UI_COPY.sort}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-48">
                      <DropdownMenuRadioGroup
                        value={query.sort}
                        onValueChange={(value) => query.setSort(String(value))}
                      >
                        <DropdownMenuLabel>{UI_COPY.sortBy}</DropdownMenuLabel>
                        {anyExpandable && (
                          <DropdownMenuRadioItem value="detail">
                            {UI_COPY.detail}
                          </DropdownMenuRadioItem>
                        )}
                        {sortableColumns.map((column) => (
                          <DropdownMenuRadioItem key={column.id} value={column.id}>
                            {columnLabel(column)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={query.dir}
                        onValueChange={(value) => query.setDir(value === "desc" ? "desc" : "asc")}
                      >
                        <DropdownMenuRadioItem value="asc">
                          {UI_COPY.ascending}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="desc">
                          {UI_COPY.descending}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>

      <TableFrame
        compact={compactEmpty}
        overlay={
          rows.length === 0 && !loading ? (
            <div className={TABLE_EMPTY_OVERLAY_CLASS}>{empty ?? UI_COPY.noResultsFound}</div>
          ) : null
        }
      >
        <Table {...overflow.handlers} aria-busy={loading || undefined} className={TABLE_CLASS}>
          {rows.length > 0 || loading || headingsWhenEmpty ? (
            <TableHeader className={TABLE_HEADER_CLASS}>
              <TableRow className="hover:bg-transparent">
                {selection && (
                  <TableHead className="h-11 w-12 min-w-12 max-w-12 px-0 text-center">
                    {rows.length > 0 && (
                      <CellControl>
                        <Checkbox
                          checked={selection.state.allSelected}
                          indeterminate={selection.state.someSelected}
                          onCheckedChange={(checked) => selection.state.toggleAll(checked)}
                          aria-label={UI_COPY.selectAllRows}
                        />
                      </CellControl>
                    )}
                  </TableHead>
                )}
                {anyExpandable && (
                  <TableHead className="h-11 w-12 min-w-12 max-w-12 px-0 text-center">
                    <span className="sr-only">{UI_COPY.detail}</span>
                  </TableHead>
                )}
                {visibleColumns.map((column) => {
                  const isActive = query.sort === column.id;

                  return (
                    <TableHead
                      key={column.id}
                      {...layoutAttributes(column)}
                      className={COLUMN_HEAD_CLASS}
                      aria-sort={ariaSort(isActive, query.dir)}
                    >
                      {column.sortable ? (
                        <SortHeader
                          active={isActive}
                          align={columnLayout(column.kind).align}
                          dir={query.dir}
                          onToggle={() => query.toggleSort(column.id)}
                        >
                          {column.header}
                        </SortHeader>
                      ) : (
                        <ColumnHeader column={column} />
                      )}
                    </TableHead>
                  );
                })}

                <TableHead className={END_COLUMN_CLASS}>
                  <EndColumnHeader
                    columns={hideable}
                    hidden={hidden}
                    onShownChange={setColumnShown}
                    rowActions={rowActions !== undefined}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {loading && rows.length === 0 ? (
              <LoadingRows
                columns={visibleColumns}
                endColumn
                expandable={anyExpandable}
                fitted
                selectable={!!selection}
              />
            ) : null}
            {rows.map((row, index) => {
              const id = getRowId(row);
              const group = groupHeader?.(row, rows[index - 1]);
              const canExpand = expandable?.isExpandable(row) ?? false;
              const isOpen = canExpand && expanded.has(id);
              const isSelected = selection?.state.has(id) ?? false;
              const isActive = activeRowId != null && activeRowId === id;
              const disabled = rowDisabled?.(row) ?? false;
              const clickable = !disabled && (canExpand || !!onRowClick);

              const handleClick = () => {
                if (canExpand) {
                  void setExpandedIds((prev) => {
                    const set = new Set(prev);

                    if (set.has(id)) set.delete(id);
                    else set.add(id);
                    const next = [...set];

                    return next.length > 0 ? next : null;
                  });
                } else {
                  onRowClick?.(row);
                }
              };

              return (
                <Fragment key={id}>
                  {group ? (
                    <TableRow className="relative bg-muted/40 hover:bg-muted/40">
                      {selection && (
                        <TableCell className="h-13 w-12 min-w-12 max-w-12 px-0 text-center" />
                      )}
                      {anyExpandable && (
                        <TableCell className="h-13 w-12 min-w-12 max-w-12 px-0 text-center" />
                      )}
                      {visibleColumns.map((column, columnIndex) => (
                        <TableCell
                          key={column.id}
                          {...layoutAttributes(column)}
                          className={cn(COLUMN_CELL_CLASS, "h-13")}
                        >
                          {columnIndex === 0 ? (
                            <div className="absolute inset-y-0 right-4 left-4 flex min-w-0 items-center *:min-w-0 *:flex-1">
                              {group}
                            </div>
                          ) : null}
                        </TableCell>
                      ))}

                      <TableCell className={cn(END_COLUMN_CLASS, "h-13")} />
                    </TableRow>
                  ) : null}
                  <TableRow
                    ref={isActive ? revealActiveRow : undefined}
                    data-row-id={id}
                    data-active={isActive || undefined}
                    data-state={isSelected ? "selected" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-expanded={canExpand ? isOpen : undefined}
                    onClick={clickable ? handleClick : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (
                              event.target === event.currentTarget &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              handleClick();
                            }
                          }
                        : undefined
                    }
                    onMouseEnter={onRowHover && !disabled ? () => onRowHover(row) : undefined}
                    onFocus={onRowHover && !disabled ? () => onRowHover(row) : undefined}
                    aria-disabled={disabled || undefined}
                    className={cn(
                      ROW_ACTIVE,
                      clickable && (anyExpandable ? ROW_ACCENT_EXPANDABLE : ROW_ACCENT),
                      clickable && "outline-none focus-visible:bg-muted/50",
                      disabled && "cursor-default",
                    )}
                  >
                    {selection && (
                      <TableCell
                        className="w-12 min-w-12 max-w-12 px-0 text-center py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <CellControl>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => selection.state.toggle(id, checked)}
                            aria-label={
                              selection.rowLabel
                                ? UI_COPY.selectNamedRow(selection.rowLabel(row))
                                : UI_COPY.selectRow
                            }
                          />
                        </CellControl>
                      </TableCell>
                    )}
                    {anyExpandable && (
                      <TableCell className="w-12 min-w-12 max-w-12 px-0 text-center py-3 align-middle text-muted-foreground">
                        {canExpand && (
                          <ChevronRight
                            className={cn(
                              "inline-block size-4 transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column.id}
                        {...layoutAttributes(column)}
                        className={cn(COLUMN_CELL_CLASS, "py-3")}
                      >
                        <ColumnContent kind={column.kind}>{column.cell(row)}</ColumnContent>
                      </TableCell>
                    ))}

                    <TableCell
                      className={cn(END_COLUMN_CLASS, "py-3")}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {rowActions ? <CellControl>{rowActions(row)}</CellControl> : null}
                    </TableCell>
                  </TableRow>
                  {isOpen &&
                    expandable?.getSubRows(row).map((sub) => {
                      const subClickable = !!expandable.onSubRowClick;

                      return (
                        <TableRow
                          key={expandable.getSubRowId(sub, row)}
                          onClick={
                            subClickable ? () => expandable.onSubRowClick?.(sub, row) : undefined
                          }
                          className={cn(
                            "bg-muted/30",
                            subClickable && (anyExpandable ? ROW_ACCENT_EXPANDABLE : ROW_ACCENT),
                          )}
                        >
                          {selection && (
                            <TableCell className="w-12 min-w-12 max-w-12 px-0 text-center py-2.5" />
                          )}
                          {anyExpandable && (
                            <TableCell className="w-12 min-w-12 max-w-12 px-0 text-center py-2.5" />
                          )}
                          {visibleColumns.map((column) => (
                            <TableCell
                              key={column.id}
                              {...layoutAttributes(column)}
                              className={cn(COLUMN_CELL_CLASS, "py-2.5")}
                            >
                              <ColumnContent kind={column.kind}>
                                {expandable.renderSubCell(sub, column.id, row)}
                              </ColumnContent>
                            </TableCell>
                          ))}

                          <TableCell className={cn(END_COLUMN_CLASS, "py-2.5")} />
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      {overflow.tooltip}

      <TablePagination
        page={query.page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={total}
        onPageChange={(page) => void query.setPage(page)}
        loading={loading}
        meta={meta}
      />
    </div>
  );
}

export type StaticTableColumn<TRow, TColumn extends string = string> = Pick<
  DataTableColumn<TRow, TColumn>,
  "id" | "header" | "cell" | "kind" | "sortable" | "label" | "hideable" | "defaultHidden"
>;

export type StaticTableSort = {
  sort: string;
  dir: SortDirection;
  onToggle: (columnId: string) => void;
};

export type StaticTablePaging = {
  totalPages?: number;
  start?: number;
  count?: number;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export type StaticTableFooterRow = {
  id: string;
  strong?: boolean;
  cells: Partial<Record<string, ReactNode>>;
};

const ROW_CONTROL_SELECTOR = "a, button, input, select, textarea, label";

function isPlainRowClick(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;

  if (!(target instanceof Element)) return false;

  if (!event.currentTarget.contains(target)) return false;

  return target.closest(ROW_CONTROL_SELECTOR) === null;
}

export function StaticTable<TRow>({
  label,
  columns: givenColumns,
  rows,
  getRowId,
  loading = false,
  loadingRows = 3,
  empty,
  paging,
  sort,
  footer,
  note,
  preview,
  onRowClick,
  rowActions,
  columnsMenu,
  groupBy,
  compactEmpty = false,
}: {
  groupBy?: (row: TRow) => string;
  compactEmpty?: boolean;
  label: string;
  columns: StaticTableColumn<TRow>[];
  rowActions?: (row: TRow) => ReactNode;
  columnsMenu?: HiddenColumns;
  rows: TRow[];
  getRowId: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  loading?: boolean;
  loadingRows?: number;
  empty: ReactNode;
  paging?: StaticTablePaging;
  sort?: StaticTableSort;
  footer?: StaticTableFooterRow[];
  note?: ReactNode;
  preview?: { rows: number; showMore: (hidden: number) => ReactNode };
}) {
  const orderedColumns = orderColumns(givenColumns);
  const hiddenIds = columnsMenu?.hidden ?? [];

  const columns = orderedColumns.filter((column) => !hiddenIds.includes(column.id));

  const hideable = columnsMenu ? orderedColumns.filter((column) => column.hideable !== false) : [];

  const endColumn = rowActions !== undefined || hideable.length > 0;
  const overflow = useOverflowTooltip();
  const noteId = useId();
  const [expanded, setExpanded] = useState(false);

  const hidden = preview && !expanded ? Math.max(0, rows.length - preview.rows) : 0;

  const shown = hidden > 0 ? rows.slice(0, preview?.rows) : rows;

  return (
    <div className="@container/table flex min-w-0 flex-col gap-3">
      <TableFrame
        compact={compactEmpty}
        label={label}
        overlay={
          rows.length === 0 && !loading ? (
            <div className={TABLE_EMPTY_OVERLAY_CLASS}>{empty}</div>
          ) : null
        }
      >
        <Table
          {...overflow.handlers}
          aria-busy={loading || undefined}
          aria-describedby={note ? noteId : undefined}
          className={TABLE_CLASS}
        >
          <TableCaption className="sr-only">{label}</TableCaption>
          {rows.length > 0 || loading ? (
            <TableHeader className={TABLE_HEADER_CLASS}>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => {
                  const isActive = sort?.sort === column.id;

                  return (
                    <TableHead
                      {...layoutAttributes(column)}
                      aria-sort={sort ? ariaSort(isActive, sort.dir) : undefined}
                      className={COLUMN_HEAD_CLASS}
                      key={column.id}
                    >
                      {sort && column.sortable ? (
                        <SortHeader
                          active={isActive}
                          align={columnLayout(column.kind).align}
                          dir={sort.dir}
                          onToggle={() => sort.onToggle(column.id)}
                        >
                          {column.header}
                        </SortHeader>
                      ) : (
                        <ColumnHeader column={column} />
                      )}
                    </TableHead>
                  );
                })}

                {endColumn ? (
                  <TableHead className={END_COLUMN_CLASS}>
                    <EndColumnHeader
                      columns={hideable}
                      hidden={hiddenIds}
                      onShownChange={(columnId, visible) =>
                        columnsMenu?.setColumnShown(columnId, visible)
                      }
                      rowActions={rowActions !== undefined}
                    />
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {loading && rows.length === 0 ? (
              <LoadingRows columns={columns} endColumn={endColumn} rows={loadingRows} />
            ) : null}
            {shown.map((row, index) => {
              const previous = shown[index - 1];
              const group = groupBy?.(row);

              const startsGroup = group && (!previous || group !== groupBy?.(previous));

              return (
                <Fragment key={getRowId(row)}>
                  {startsGroup ? (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        className="h-12 px-4 py-3 font-medium text-label"
                        colSpan={columns.length + Number(endColumn)}
                      >
                        <span className="block truncate">{group}</span>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow
                    className={onRowClick ? ROW_ACCENT : undefined}
                    key={getRowId(row)}
                    onClick={
                      onRowClick
                        ? (event) => {
                            if (isPlainRowClick(event)) onRowClick(row);
                          }
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <TableCell
                        {...layoutAttributes(column)}
                        className={cn(COLUMN_CELL_CLASS, "py-3")}
                        key={column.id}
                      >
                        <ColumnContent kind={column.kind}>{column.cell(row)}</ColumnContent>
                      </TableCell>
                    ))}

                    {endColumn ? (
                      <TableCell
                        className={cn(END_COLUMN_CLASS, "py-3")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {rowActions ? <CellControl>{rowActions(row)}</CellControl> : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                </Fragment>
              );
            })}
            {hidden > 0 && preview ? (
              <TableRow className="relative hover:bg-transparent">
                {columns.map((column, columnIndex) => (
                  <TableCell
                    {...layoutAttributes(column)}
                    className={cn(COLUMN_CELL_CLASS, "h-12")}
                    key={column.id}
                  >
                    {columnIndex === 0 ? (
                      <div className="absolute inset-y-0 left-4 flex items-center">
                        <Button
                          className="-ml-3 text-muted-foreground"
                          onClick={() => setExpanded(true)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {preview.showMore(hidden)}
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                ))}

                {endColumn ? <TableCell className={END_COLUMN_CLASS} /> : null}
              </TableRow>
            ) : null}
          </TableBody>
          {footer && rows.length > 0 ? (
            <TableFooter className="bg-transparent">
              {footer.map((footerRow) => (
                <TableRow
                  className={cn(
                    "border-0 hover:bg-transparent",
                    footerRow.strong
                      ? "font-medium text-foreground"
                      : "font-normal text-muted-foreground",
                  )}
                  key={footerRow.id}
                >
                  {columns.map((column) => (
                    <TableCell
                      {...layoutAttributes(column)}
                      className={cn(COLUMN_CELL_CLASS, "py-2")}
                      key={column.id}
                    >
                      {footerRow.cells[column.id]}
                    </TableCell>
                  ))}

                  {endColumn ? <TableCell className={cn(END_COLUMN_CLASS, "py-2")} /> : null}
                </TableRow>
              ))}
            </TableFooter>
          ) : null}
        </Table>
      </TableFrame>
      {note ? (
        <p className="text-label text-muted-foreground" id={noteId}>
          {note}
        </p>
      ) : null}
      {overflow.tooltip}
      {paging && (paging.totalPages ?? Math.ceil(paging.total / paging.pageSize)) > 1 ? (
        <TablePagination
          onPageChange={paging.onPageChange}
          page={paging.page}
          pageSize={paging.pageSize}
          total={paging.total}
          totalPages={paging.totalPages ?? Math.ceil(paging.total / paging.pageSize)}
          start={paging.start}
          count={paging.count}
        />
      ) : null}
    </div>
  );
}
