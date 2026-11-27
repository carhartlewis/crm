import { enrichmentLabel, ENRICHMENT_STATUSES, isOpenStage } from "@crm/core/records";
import type { DataTableColumn } from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { CountCell, TextCell } from "@crm/ui/patterns/data-table/table-cells";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Company, companiesCollection } from "../../lib/companies.ts";
import { ACTIVITY_FACET, activityBuckets } from "../../lib/activity-bucket.ts";
import { localDay, momentDate, relativeTime } from "../../lib/record-format.ts";
import { deleteRecords } from "../../lib/synced-records.ts";
import { useCustomColumns } from "../records/use-custom-columns.ts";
import { AssignOwnerMenu } from "../records/bulk-edit.tsx";
import { CompanyLogo, OwnerCell } from "../records/record-visuals.tsx";
import {
  activityAt,
  ownerFacet,
  RecordTable,
  STATUS_FACET,
  statusOf,
} from "../records/record-table.tsx";
import {
  countBy,
  useCompanies,
  useContacts,
  useDeals,
  useMembers,
  type Member,
} from "../records/use-crm.ts";

type Facet = "owner" | "industry" | "enrichment" | "activity" | "status";

const SEARCH_PARAMS = createListSearchParams<never, Facet>({
  defaultSort: "createdAt",
  defaultDir: "desc",
  facetIds: ["owner", "industry", "enrichment", "activity", "status"],
  facetDefaults: { status: ["active"] },
});

type Column =
  | "name"
  | "domain"
  | "industry"
  | "owner"
  | "contacts"
  | "openDeals"
  | "createdAt"
  | "lastActivity"
  | "enrichment";

interface ColumnDeps {
  readonly memberOf: (id: string | null | undefined) => Member | null;
  readonly contactCounts: ReadonlyMap<string, number>;
  readonly openDealCounts: ReadonlyMap<string, number>;
}

function companyColumns({
  memberOf,
  contactCounts,
  openDealCounts,
}: ColumnDeps): DataTableColumn<Company, Column>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Company",
      sortable: true,
      hideable: false,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <CompanyLogo company={row} size="sm" />
          <span className="block min-w-0 truncate font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      id: "domain",
      kind: "text",
      header: "Domain",
      sortable: true,
      cell: (row) => <TextCell>{row.domain}</TextCell>,
    },
    {
      id: "industry",
      kind: "text",
      header: "Industry",
      sortable: true,
      cell: (row) => <TextCell>{row.industry}</TextCell>,
    },
    {
      id: "owner",
      kind: "person",
      header: "Owner",
      sortable: true,
      cell: (row) => <OwnerCell owner={memberOf(row.owner_id)} />,
    },
    {
      id: "contacts",
      kind: "count",
      header: "Contacts",
      sortable: true,
      cell: (row) => <CountCell>{String(contactCounts.get(row.id) ?? 0)}</CountCell>,
    },
    {
      id: "openDeals",
      kind: "count",
      header: "Open deals",
      sortable: true,
      cell: (row) => <CountCell>{String(openDealCounts.get(row.id) ?? 0)}</CountCell>,
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
    {
      id: "enrichment",
      kind: "short",
      header: "Enrichment",
      sortable: true,
      defaultHidden: true,
      cell: (row) => <TextCell>{enrichmentLabel(row.enrichment_status)}</TextCell>,
    },
  ];
}

export interface CompaniesTableProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/** Companies, synced locally: search, filter and sort never wait on the network. */
export function CompaniesTable({ userId, workspaceId }: CompaniesTableProps) {
  const collection = companiesCollection(workspaceId);
  const { companies, loading } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const { deals } = useDeals(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);

  const custom = useCustomColumns<Company, never, Facet>({
    entity: "company",
    userId,
    workspaceId,
    base: SEARCH_PARAMS,
  });

  const contactCounts = countBy(
    contacts.filter((contact) => !contact.archived_at),
    (contact) => contact.company_id,
  );

  const openDealCounts = countBy(
    deals.filter((deal) => !deal.archived_at && isOpenStage(deal.stage)),
    (deal) => deal.company_id,
  );

  const remove = useMutation({
    mutationFn: (ids: readonly string[]) => deleteRecords(collection, ids),
    onSuccess: (count) =>
      toast.success(count === 1 ? "Company deleted" : `${count} companies deleted`),
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

  const industries = [
    ...new Set(companies.map((company) => company.industry).filter((value) => value !== null)),
  ].toSorted();

  const today = localDay();

  const assignOwner = useMutation({
    mutationFn: async ({ ids, ownerId }: { ids: readonly string[]; ownerId: string | null }) => {
      await collection
        .update([...ids], (drafts) => {
          for (const draft of drafts) draft.owner_id = ownerId;
        })
        .when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  /** A company takes its deals with it; its contacts stay. */
  const deleteImpact = (ids: readonly string[]) => {
    const gone = new Set(ids);

    return {
      deals: deals.filter((deal) => gone.has(deal.company_id)).length,
      contacts: contacts.filter((contact) => contact.company_id && gone.has(contact.company_id))
        .length,
    };
  };

  const columns = companyColumns({ memberOf, contactCounts, openDealCounts });

  return (
    <RecordTable
      archive={(ids, archived) => archive.mutate({ ids, archived })}
      blank={{ title: "No companies yet", description: "Press ⌥⇧C to add your first company." }}
      columns={[...columns, ...custom.columns]}
      facetOf={{
        ...custom.facetOf,
        owner: (row) => row.owner_id ?? "none",
        industry: (row) => row.industry ?? "",
        enrichment: (row) => row.enrichment_status,
        activity: (row) => activityBuckets(row.last_activity_at, today),
        status: statusOf,
      }}
      facets={[
        ownerFacet(members),
        {
          id: "industry",
          label: "Industry",
          options: industries.map((industry) => ({ value: industry, label: industry })),
        },
        {
          id: "enrichment",
          label: "Enrichment",
          options: ENRICHMENT_STATUSES.map((status) => ({ value: status.id, label: status.label })),
        },
        ACTIVITY_FACET,
        STATUS_FACET,
        ...custom.facets,
      ]}
      haystack={(row) =>
        `${row.name} ${row.domain ?? ""} ${row.industry ?? ""} ${nameOf(row.owner_id) ?? ""}`
      }
      renderBulkActions={(ids, clear) => (
        <AssignOwnerMenu
          members={members}
          onAssign={(ownerId) => {
            assignOwner.mutate({ ids, ownerId });
            clear();
          }}
        />
      )}
      deleteImpact={deleteImpact}
      kind="company"
      label={(row) => row.name}
      loading={loading}
      noun={{ one: "company", many: "companies" }}
      remove={(ids) => remove.mutate(ids)}
      removing={remove.isPending || archive.isPending || assignOwner.isPending}
      rows={companies}
      saved={{ workspaceId, userId }}
      searchParams={custom.searchParams}
      searchPlaceholder="Search companies by name or domain…"
      sortValues={{
        ...custom.sortValues,
        name: (row) => row.name.toLowerCase(),
        domain: (row) => row.domain ?? "",
        industry: (row) => row.industry ?? "",
        owner: (row) => nameOf(row.owner_id) ?? "",
        contacts: (row) => contactCounts.get(row.id) ?? 0,
        openDeals: (row) => openDealCounts.get(row.id) ?? 0,
        createdAt: (row) => row.created_at,
        lastActivity: activityAt,
        enrichment: (row) => row.enrichment_status,
      }}
      tableId="companies"
    />
  );
}
