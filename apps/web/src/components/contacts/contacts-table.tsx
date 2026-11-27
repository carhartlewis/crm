import { contactName } from "@crm/core/records";
import type { DataTableColumn } from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { TextCell } from "@crm/ui/patterns/data-table/table-cells";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { Company } from "../../lib/companies.ts";
import { type Contact, contactsCollection } from "../../lib/contacts.ts";
import { ACTIVITY_FACET, activityBuckets } from "../../lib/activity-bucket.ts";
import { localDay, momentDate, relativeTime } from "../../lib/record-format.ts";
import { deleteRecords } from "../../lib/synced-records.ts";
import { useCustomColumns } from "../records/use-custom-columns.ts";
import {
  AssignOwnerMenu,
  type BulkTarget,
  CompanyPickerDialog,
  SetCompanyItem,
} from "../records/bulk-edit.tsx";
import {
  CompanyCell,
  ContactAvatar,
  NameWithMark,
  OwnerCell,
  MARK_SIZE,
} from "../records/record-visuals.tsx";
import {
  activityAt,
  ownerFacet,
  RecordTable,
  STATUS_FACET,
  statusOf,
} from "../records/record-table.tsx";
import { byId, useCompanies, useContacts, useMembers, type Member } from "../records/use-crm.ts";

type Facet = "owner" | "company" | "title" | "seniority" | "function" | "activity" | "status";

const SEARCH_PARAMS = createListSearchParams<never, Facet>({
  defaultSort: "createdAt",
  defaultDir: "desc",
  facetIds: ["owner", "company", "title", "seniority", "function", "activity", "status"],
  facetDefaults: { status: ["active"] },
});

type Column = "name" | "title" | "email" | "company" | "owner" | "createdAt" | "lastActivity";

interface ColumnDeps {
  readonly companiesById: ReadonlyMap<string, Company>;
  readonly memberOf: (id: string | null | undefined) => Member | null;
}

function contactColumns({
  companiesById,
  memberOf,
}: ColumnDeps): DataTableColumn<Contact, Column>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Name",
      sortable: true,
      hideable: false,
      cell: (row) => (
        <NameWithMark
          mark={<ContactAvatar contact={row} size={MARK_SIZE} />}
          name={contactName(row)}
          strong
        />
      ),
    },
    {
      id: "title",
      kind: "text",
      header: "Title",
      sortable: true,
      cell: (row) => <TextCell>{row.title}</TextCell>,
    },
    {
      id: "email",
      kind: "text",
      header: "Email",
      sortable: true,
      cell: (row) => <TextCell>{row.email}</TextCell>,
    },
    {
      id: "company",
      kind: "text",
      header: "Company",
      sortable: true,
      cell: (row) => (
        <CompanyCell company={row.company_id ? companiesById.get(row.company_id) : null} />
      ),
    },
    {
      id: "owner",
      kind: "person",
      header: "Owner",
      sortable: true,
      cell: (row) => <OwnerCell owner={memberOf(row.owner_id)} />,
    },
    {
      id: "createdAt",
      kind: "date",
      header: "Created",
      sortable: true,
      defaultHidden: true,
      cell: (row) => <TextCell>{momentDate(row.created_at)}</TextCell>,
    },
    {
      id: "lastActivity",
      kind: "date",
      header: "Last activity",
      sortable: true,
      cell: (row) => <TextCell>{relativeTime(row.last_activity_at)}</TextCell>,
    },
  ];
}

/** Distinct non-empty values, sorted, as filter options. */
const optionsOf = (values: readonly (string | null)[]) =>
  [...new Set(values.filter((value) => value !== null && value !== ""))]
    .toSorted()
    .map((value) => ({ value: value ?? "", label: value ?? "" }));

/** Contacts, synced locally: search, filter and sort never wait on the network. */
export function ContactsTable({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const collection = contactsCollection(workspaceId);
  const { contacts, loading } = useContacts(workspaceId);
  const { companies } = useCompanies(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);

  const custom = useCustomColumns<Contact, never, Facet>({
    entity: "contact",
    userId,
    workspaceId,
    base: SEARCH_PARAMS,
  });

  const companiesById = byId(companies);

  const companyName = (row: Contact) =>
    (row.company_id ? companiesById.get(row.company_id)?.name : null) ?? null;

  const today = localDay();
  const [moving, setMoving] = useState<BulkTarget | null>(null);

  // Bulk edits change every selected row at once; a refusal rolls them all back.
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, patch }: { ids: readonly string[]; patch: Partial<Contact> }) => {
      if (ids.length === 0) return;

      await collection
        .update([...ids], (drafts) => {
          for (const draft of drafts) Object.assign(draft, patch);
        })
        .when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (ids: readonly string[]) => deleteRecords(collection, ids),
    onSuccess: (count) =>
      toast.success(count === 1 ? "Contact deleted" : `${count} contacts deleted`),
    onError: (error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: async ({ ids, archived }: { ids: readonly string[]; archived: boolean }) => {
      const at = archived ? new Date().toISOString() : null;

      await collection
        .update([...ids], (drafts) => {
          for (const draft of drafts) draft.archived_at = at;
        })
        .when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const columns = contactColumns({ companiesById, memberOf });

  return (
    <>
      <RecordTable
        archive={(ids, archived) => archive.mutate({ ids, archived })}
        blank={{ title: "No contacts yet", description: "Press ⌥⇧P to add your first contact." }}
        columns={[...columns, ...custom.columns]}
        facetOf={{
          ...custom.facetOf,
          owner: (row) => row.owner_id ?? "none",
          company: (row) => row.company_id ?? "none",
          title: (row) => row.title ?? "",
          seniority: (row) => row.seniority ?? "",
          function: (row) => row.function ?? "",
          activity: (row) => activityBuckets(row.last_activity_at, today),
          status: statusOf,
        }}
        facets={[
          ownerFacet(members),
          {
            id: "company",
            label: "Company",
            searchable: true,
            options: [
              { value: "none", label: "No company" },
              ...companies
                .filter((company) => !company.archived_at)
                .toSorted((left, right) => left.name.localeCompare(right.name))
                .map((company) => ({ value: company.id, label: company.name })),
            ],
          },
          {
            id: "title",
            label: "Title",
            searchable: true,
            options: optionsOf(contacts.map((row) => row.title)),
          },
          {
            id: "seniority",
            label: "Seniority",
            options: optionsOf(contacts.map((row) => row.seniority)),
          },
          {
            id: "function",
            label: "Function",
            options: optionsOf(contacts.map((row) => row.function)),
          },
          ACTIVITY_FACET,
          STATUS_FACET,
          ...custom.facets,
        ]}
        haystack={(row) =>
          `${contactName(row)} ${row.email ?? ""} ${row.title ?? ""} ${companyName(row) ?? ""}`
        }
        renderBulkActions={(ids, clear) => (
          <>
            <AssignOwnerMenu
              members={members}
              onAssign={(ownerId) => {
                bulkUpdate.mutate({ ids, patch: { owner_id: ownerId } });
                clear();
              }}
            />
            <SetCompanyItem
              onOpen={() => {
                setMoving({ ids: [...ids], value: undefined });
                clear();
              }}
            />
          </>
        )}
        kind="contact"
        label={contactName}
        loading={loading}
        noun={{ one: "contact", many: "contacts" }}
        remove={(ids) => remove.mutate(ids)}
        removing={remove.isPending || archive.isPending || bulkUpdate.isPending}
        rows={contacts}
        saved={{ workspaceId, userId }}
        searchParams={custom.searchParams}
        searchPlaceholder="Search by name, email or company…"
        sortValues={{
          ...custom.sortValues,
          name: (row) => contactName(row).toLowerCase(),
          title: (row) => row.title ?? "",
          email: (row) => row.email ?? "",
          company: (row) => companyName(row)?.toLowerCase() ?? "",
          owner: (row) => nameOf(row.owner_id) ?? "",
          createdAt: (row) => row.created_at,
          lastActivity: activityAt,
        }}
        tableId="contacts"
      />
      <CompanyPickerDialog
        companies={companies
          .filter((company) => !company.archived_at)
          .toSorted((left, right) => left.name.localeCompare(right.name))}
        onCancel={() => setMoving(null)}
        onPick={(target, companyId) => {
          bulkUpdate.mutate({ ids: target.ids, patch: { company_id: companyId } });
          setMoving(null);
        }}
        target={moving}
      />
    </>
  );
}
