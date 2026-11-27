import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { BulkActionsMenu } from "@crm/ui/patterns/data-table/bulk-actions";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFacet,
} from "@crm/ui/patterns/data-table/data-table";
import type { ListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { useListTable } from "@crm/ui/patterns/data-table/use-list-table";
import type { SortValues } from "@crm/ui/patterns/data-table/client-table";
import type { TableView } from "@crm/ui/patterns/data-table/table-views";
import { RecordRowMenu } from "@crm/ui/patterns/record-sheet/record-sheet";
import { type ReactNode, useRef, useState } from "react";
import { useCreateSheet } from "../../lib/create-sheet.ts";
import { type RecordKind, useRecordSheet } from "../../lib/records.ts";
import { listKeys } from "../../lib/saved-views.ts";
import { ConfirmDeleteDialog, type DeleteImpact } from "./confirm-delete-dialog.tsx";
import { SavedViewsMenu } from "./saved-views.tsx";
import { noPosition, type ListPosition, useListKeys } from "./use-list-keys.ts";

type Row = {
  readonly id: string;
  readonly archived_at: string | null;
  readonly created_at: string;
};

export interface RecordTableProps<
  R extends Row,
  Tab extends string,
  Facet extends string,
  Column extends string,
> {
  readonly kind: RecordKind;
  readonly tableId: string;
  readonly searchParams: ListSearchParams<Tab, Facet>;
  readonly rows: readonly R[];
  readonly loading: boolean;
  readonly columns: DataTableColumn<R, Column>[];
  readonly facets: DataTableFacet[];
  readonly facetOf: Record<Facet, (row: R) => string | string[]>;
  readonly sortValues: SortValues<R, Column>;
  readonly haystack: (row: R) => string;
  readonly views?: { items: readonly TableView<R>[]; label: string; allLabel: string };
  readonly label: (row: R) => string;
  readonly noun: { readonly one: string; readonly many: string };
  readonly searchPlaceholder: string;
  readonly blank: { title: string; description: string };
  /** Replaces the "x of N" footer, such as the deals' open pipeline. */
  readonly meta?: (visible: readonly R[]) => ReactNode;
  readonly archive: (ids: readonly string[], archived: boolean) => void;
  readonly remove: (ids: readonly string[]) => void;
  readonly removing: boolean;
  /** Saved views for this list (ADR 0024): the Views menu leads the toolbar. */
  readonly saved?: { readonly workspaceId: string; readonly userId: string };
  /** Extra items at the top of the selection menu; `clear` empties the selection. */
  readonly renderBulkActions?: (ids: readonly string[], clear: () => void) => ReactNode;
  /** What else a delete takes or changes, for the confirmation (a company's deals). */
  readonly deleteImpact?: (ids: readonly string[]) => DeleteImpact;
}

/**
 * A synced record list: search, filters, sort and column choice run locally, j/k move, Enter
 * opens the record's sheet (mounted in the shell), x selects, and selected rows archive or
 * delete together. Archived rows show only under the Archived status filter.
 */
export function RecordTable<
  R extends Row,
  Tab extends string,
  Facet extends string,
  Column extends string,
>(props: RecordTableProps<R, Tab, Facet, Column>) {
  const [createKind] = useCreateSheet();
  const record = useRecordSheet(props.kind);
  const [position, setPosition] = useState<ListPosition>(noPosition);
  const [deleting, setDeleting] = useState<readonly string[] | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const list = useListTable({
    tableId: props.tableId,
    searchParams: props.searchParams,
    rows: props.rows,
    loading: props.loading,
    getRowId: (row) => row.id,
    haystack: props.haystack,
    sortValues: props.sortValues,
    facetOf: props.facetOf,
    tieBreak: (left, right) => right.created_at.localeCompare(left.created_at),
    views: props.views,
    noun: props.noun.many,
    searchPlaceholder: props.searchPlaceholder,
    blank: props.blank,
    filtered: `No matching ${props.noun.many}.`,
  });

  const ids = list.visible.map((row) => row.id);

  // Only the keys show the active row. A row opened with the pointer keeps the list's place for
  // j/k, but stays unmarked when its sheet closes.
  const [keyed, setKeyed] = useState(false);

  const openWith = (fromKeys: boolean) => (id: string) => {
    setPosition({ activeId: id, anchorId: null });
    setKeyed(fromKeys);
    void record.open(id);
  };

  const open = openWith(false);

  const moveTo = (next: ListPosition) => {
    setPosition(next);
    setKeyed(true);
    list.reveal(next.activeId);
  };

  useListKeys({
    ids,
    position,
    setPosition: moveTo,
    selection: list.selection,
    enabled: !record.anyOpen && createKind === null && deleting === null,
    onOpen: openWith(true),
    onFilter: () => frame.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
  });

  const count = list.selection.count;
  const noun = count === 1 ? props.noun.one : props.noun.many;
  const selectedRows = props.rows.filter((row) => list.selection.ids.includes(row.id));

  const allArchived =
    selectedRows.length > 0 && selectedRows.every((row) => row.archived_at !== null);

  const deletingOne =
    deleting?.length === 1 ? props.rows.find((row) => row.id === deleting[0]) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" ref={frame}>
      <DataTable
        {...list.tableProps}
        {...(props.meta ? { meta: props.meta(list.visible) } : {})}
        activeRowId={keyed ? position.activeId : null}
        columns={props.columns}
        facetCounts={{}}
        facets={props.facets}
        lead={
          props.saved ? (
            <SavedViewsMenu
              entity={props.kind}
              keys={listKeys(props.searchParams)}
              userId={props.saved.userId}
              workspaceId={props.saved.workspaceId}
            />
          ) : undefined
        }
        onRowClick={(row) => open(row.id)}
        rowActions={rowMenu({
          open,
          archive: props.archive,
          remove: setDeleting,
          label: props.label,
        })}
        selection={{
          state: list.selection,
          rowLabel: props.label,
          actions: (
            <BulkActionsMenu pending={props.removing}>
              {props.renderBulkActions?.(list.selection.ids, () => list.selection.clear())}
              <DropdownMenuItem
                onClick={() => {
                  props.archive(list.selection.ids, !allArchived);
                  list.selection.clear();
                }}
              >
                {`${allArchived ? "Restore" : "Archive"} ${count} ${noun}`}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleting([...list.selection.ids])}
                variant="destructive"
              >
                {`Delete ${count} ${noun}`}
              </DropdownMenuItem>
            </BulkActionsMenu>
          ),
        }}
      />
      <ConfirmDeleteDialog
        ids={deleting}
        impact={deleting ? props.deleteImpact?.(deleting) : undefined}
        kind={props.kind}
        name={deletingOne ? props.label(deletingOne) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={(chosen) => {
          props.remove(chosen);
          list.selection.clear();
          setDeleting(null);
        }}
      />
    </div>
  );
}

interface RowMenuActions<R extends Row> {
  readonly open: (id: string) => void;
  readonly archive: (ids: readonly string[], archived: boolean) => void;
  readonly remove: (ids: readonly string[]) => void;
  readonly label: (row: R) => string;
}

/** Each row's `…` menu: view, archive or restore, delete. */
function rowMenu<R extends Row>({ open, archive, remove, label }: RowMenuActions<R>) {
  return function RowMenu(row: R) {
    return (
      <RecordRowMenu
        items={[
          { id: "open", label: "View details", onSelect: () => open(row.id) },
          row.archived_at
            ? { id: "restore", label: "Restore", onSelect: () => archive([row.id], false) }
            : { id: "archive", label: "Archive", onSelect: () => archive([row.id], true) },
          { id: "delete", label: "Delete", destructive: true, onSelect: () => remove([row.id]) },
        ]}
        label={`Actions for ${label(row)}`}
      />
    );
  };
}

/** The Status filter every record list has: active rows by default, archived on request. */
export const STATUS_FACET: DataTableFacet = {
  id: "status",
  label: "Status",
  options: [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ],
};

export const statusOf = (row: { readonly archived_at: string | null }) =>
  row.archived_at ? "archived" : "active";

/** Owner filter options: unassigned, then every member. */
export function ownerFacet(members: readonly { id: string; name: string }[]): DataTableFacet {
  return {
    id: "owner",
    label: "Owner",
    options: [
      { value: "none", label: "Unassigned" },
      ...members.map((member) => ({ value: member.id, label: member.name })),
    ],
  };
}

/** Last activity, falling back to when the record was added so new rows sort sensibly. */
export const activityAt = (row: { last_activity_at: string | null; created_at: string }) =>
  row.last_activity_at ?? row.created_at;
