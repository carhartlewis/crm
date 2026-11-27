import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { BulkActionsMenu } from "@crm/ui/patterns/data-table/bulk-actions";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFacet,
} from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { DayCell, TextCell, TitleCell } from "@crm/ui/patterns/data-table/table-cells";
import { useListTable } from "@crm/ui/patterns/data-table/use-list-table";
import { RecordRowMenu } from "@crm/ui/patterns/record-sheet/record-sheet";
import { useRecordSheetParams } from "@crm/ui/patterns/record-sheet/use-record-sheet-params";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type Company, companiesCollection, deleteCompaniesMutation } from "../../lib/companies.ts";
import { useCreateSheet } from "../../lib/create-sheet.ts";
import { RECORD_TABS } from "../../lib/records.ts";
import { workspaceQuery } from "../../lib/session.ts";
import { noPosition, type ListPosition, useListKeys } from "../records/use-list-keys.ts";

const SEARCH_PARAMS = createListSearchParams<never, "owner">({
  defaultSort: "updatedAt",
  defaultDir: "desc",
  facetIds: ["owner"],
});

type Column = "name" | "domain" | "owner" | "updatedAt" | "createdAt";

type OwnerName = (ownerId: string | null) => string | null;

/** The columns, ordered by kind in the table (title, person, text, dates). */
function companyColumns(ownerName: OwnerName): DataTableColumn<Company, Column>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Name",
      sortable: true,
      hideable: false,
      cell: (row) => <TitleCell>{row.name}</TitleCell>,
    },
    {
      id: "domain",
      kind: "text",
      header: "Domain",
      sortable: true,
      cell: (row) => <TextCell>{row.domain}</TextCell>,
    },
    {
      id: "owner",
      kind: "person",
      header: "Owner",
      sortable: true,
      cell: (row) => <TextCell>{ownerName(row.owner_id)}</TextCell>,
    },
    {
      id: "updatedAt",
      kind: "date",
      header: "Last change",
      sortable: true,
      cell: (row) => <DayCell value={row.updated_at} />,
    },
    {
      id: "createdAt",
      kind: "date",
      header: "Created",
      sortable: true,
      defaultHidden: true,
      cell: (row) => <DayCell value={row.created_at} />,
    },
  ];
}

/** The row's "…" menu. */
function companyRowMenu(actions: { open: (id: string) => void; remove: (id: string) => void }) {
  return function CompanyRowMenu(row: Company) {
    return (
      <RecordRowMenu
        label={`Actions for ${row.name}`}
        items={[
          { id: "open", label: "View details", onSelect: () => actions.open(row.id) },
          {
            id: "delete",
            label: "Delete",
            destructive: true,
            onSelect: () => actions.remove(row.id),
          },
        ]}
      />
    );
  };
}

export interface CompaniesTableProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/** Companies, synced locally: search, filter and sort never wait on the network. */
export function CompaniesTable({ userId, workspaceId }: CompaniesTableProps) {
  const collection = companiesCollection(workspaceId);

  const { data: rows = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ company: collection }),
  });

  const { data: workspace } = useQuery(workspaceQuery(userId, workspaceId));
  const [createKind] = useCreateSheet();
  const record = useRecordSheetParams({ recordKey: "company", tabs: RECORD_TABS.company });
  const [position, setPosition] = useState<ListPosition>(noPosition);
  const frame = useRef<HTMLDivElement>(null);

  const ownerName = (ownerId: string | null) =>
    workspace?.members.find((member) => member.userId === ownerId)?.user.name ?? null;

  const remove = useMutation({
    ...deleteCompaniesMutation,
    onSuccess: (count) =>
      toast.success(count === 1 ? "Company deleted" : `${count} companies deleted`),
    onError: (error) => toast.error(error.message),
  });

  const columns = companyColumns(ownerName);

  const facets: DataTableFacet[] = [
    {
      id: "owner",
      label: "Owner",
      options: (workspace?.members ?? []).map((member) => ({
        value: member.userId,
        label: member.user.name,
      })),
    },
  ];

  const list = useListTable({
    tableId: "companies",
    searchParams: SEARCH_PARAMS,
    rows,
    loading: isLoading,
    getRowId: (row) => row.id,
    haystack: (row) => `${row.name} ${row.domain ?? ""} ${ownerName(row.owner_id) ?? ""}`,
    sortValues: {
      name: (row) => row.name.toLowerCase(),
      domain: (row) => row.domain ?? "",
      owner: (row) => ownerName(row.owner_id) ?? "",
      updatedAt: (row) => row.updated_at,
      createdAt: (row) => row.created_at,
    },
    facetOf: { owner: (row) => row.owner_id ?? "" },
    tieBreak: (left, right) => right.created_at.localeCompare(left.created_at),
    noun: "companies",
    searchPlaceholder: "Search companies…",
    blank: { title: "No companies yet", description: "Press C to add your first company." },
    filtered: "No matching companies.",
  });

  const ids = list.visible.map((row) => row.id);

  const open = (id: string) => {
    setPosition({ activeId: id, anchorId: null });
    void record.open(id);
  };

  // Keyboard moves turn the page with the active row.
  const moveTo = (next: ListPosition) => {
    setPosition(next);
    list.reveal(next.activeId);
  };

  // The sheet itself is in the shell (CompanySheet), so it also opens from ⌘K.
  const sheetOpen = record.id !== null;

  useListKeys({
    ids,
    position,
    setPosition: moveTo,
    selection: list.selection,
    enabled: !sheetOpen && createKind === null,
    onOpen: open,
    onFilter: () => frame.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
  });

  return (
    <div ref={frame} className="flex min-h-0 flex-1 flex-col gap-4">
      <DataTable
        {...list.tableProps}
        columns={columns}
        facetCounts={{}}
        facets={facets}
        activeRowId={position.activeId}
        onRowClick={(row) => open(row.id)}
        rowActions={companyRowMenu({
          open,
          remove: (id) => remove.mutate({ collection, ids: [id] }),
        })}
        selection={{
          state: list.selection,
          rowLabel: (row) => row.name,
          actions: (
            <BulkActionsMenu pending={remove.isPending}>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  remove.mutate({ collection, ids: list.selection.ids });
                  list.selection.clear();
                }}
              >
                {`Delete ${list.selection.count} ${list.selection.count === 1 ? "company" : "companies"}`}
              </DropdownMenuItem>
            </BulkActionsMenu>
          ),
        }}
      />
    </div>
  );
}
