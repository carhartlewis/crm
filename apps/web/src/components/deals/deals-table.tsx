import {
  CLOSING_BUCKETS,
  closingBucket,
  DEAL_STAGES,
  dealStage,
  formatMoneyCompact,
  isLosingStage,
  isOpenStage,
  pipelineSummary,
} from "@crm/core/records";
import type { DataTableColumn } from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { TextCell } from "@crm/ui/patterns/data-table/table-cells";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { Company } from "../../lib/companies.ts";
import { type Deal, dealsCollection } from "../../lib/deals.ts";
import { notCountedNote, useReportingCurrency } from "../../lib/money.ts";
import { calendarDate, localDay, momentDate, relativeTime } from "../../lib/record-format.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { useCustomColumns } from "../records/use-custom-columns.ts";
import {
  AssignOwnerMenu,
  type BulkTarget,
  LosingReasonDialog,
  SetStageMenu,
} from "../records/bulk-edit.tsx";
import { CompanyCell, MoneyCell, OwnerCell } from "../records/record-visuals.tsx";
import {
  activityAt,
  ownerFacet,
  RecordTable,
  STATUS_FACET,
  statusOf,
} from "../records/record-table.tsx";
import { type StageChange, StageMenu } from "../records/stage-menu.tsx";
import { byId, useCompanies, useDeals, useMembers, type Member } from "../records/use-crm.ts";

type Facet = "owner" | "stage" | "closing" | "status";

const SEARCH_PARAMS = createListSearchParams<"view", Facet>({
  defaultSort: "createdAt",
  defaultDir: "desc",
  tabId: "view",
  facetIds: ["owner", "stage", "closing", "status"],
  facetDefaults: { status: ["active"] },
});

type Column =
  | "name"
  | "company"
  | "stage"
  | "amount"
  | "owner"
  | "close"
  | "createdAt"
  | "lastActivity";

interface ColumnDeps {
  readonly companiesById: ReadonlyMap<string, Company>;
  readonly memberOf: (id: string | null | undefined) => Member | null;
  readonly stageChange: (id: string, change: StageChange) => void;
}

function dealColumns({
  companiesById,
  memberOf,
  stageChange,
}: ColumnDeps): DataTableColumn<Deal, Column>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Deal",
      sortable: true,
      hideable: false,
      // The company column shows the logo, so the name stands alone.
      cell: (row) => <span className="truncate font-medium">{row.name}</span>,
    },
    {
      id: "company",
      kind: "text",
      header: "Company",
      sortable: true,
      cell: (row) => <CompanyCell company={companiesById.get(row.company_id)} />,
    },
    {
      id: "stage",
      kind: "status",
      header: "Stage",
      sortable: true,
      cell: (row) => (
        <StageMenu
          onChange={(change) => stageChange(row.id, change)}
          stage={row.stage}
          variant="cell"
        />
      ),
    },
    {
      id: "amount",
      kind: "count",
      header: "Amount",
      sortable: true,
      cell: (row) => <MoneyCell amount={row.amount} currency={row.currency} />,
    },
    {
      id: "owner",
      kind: "person",
      header: "Owner",
      sortable: true,
      cell: (row) => <OwnerCell owner={memberOf(row.owner_id)} />,
    },
    {
      id: "close",
      kind: "date",
      header: "Close date",
      sortable: true,
      cell: (row) => <TextCell>{calendarDate(row.expected_close_date)}</TextCell>,
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

/**
 * The footer under the table: how many deals are visible and their open pipeline in the
 * reporting currency, plus the deals left out for want of a rate.
 */
const pipelineMeta = (reporting: string) =>
  function PipelineMeta(visible: readonly Deal[]) {
    const summary = pipelineSummary(visible, reporting);
    const note = notCountedNote(summary);

    return (
      <span className="text-label text-muted-foreground tabular-nums">
        {`${visible.length} ${visible.length === 1 ? "deal" : "deals"} · ${formatMoneyCompact(summary.total, reporting)} open pipeline`}
        {note ? ` · ${note}` : ""}
      </span>
    );
  };

/** The pipeline, synced locally: search, filter and sort never wait on the network. */
export function DealsTable({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const collection = dealsCollection(workspaceId);
  const { deals, loading } = useDeals(workspaceId);
  const { companies } = useCompanies(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);

  const custom = useCustomColumns<Deal, "view", Facet>({
    entity: "deal",
    userId,
    workspaceId,
    base: SEARCH_PARAMS,
  });

  const companiesById = byId(companies);
  const today = localDay();
  const reporting = useReportingCurrency(workspaceId);

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Deal> }) =>
      saveRecord(collection, id, patch),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (ids: readonly string[]) => deleteRecords(collection, ids),
    onSuccess: (count) => toast.success(count === 1 ? "Deal deleted" : `${count} deals deleted`),
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

  const stageChange = (id: string, change: StageChange) =>
    save.mutate({
      id,
      patch: {
        stage: change.stage,
        closed_reason: change.closed_reason ?? null,
        stage_changed_at: new Date().toISOString(),
      },
    });

  const companyName = (row: Deal) => companiesById.get(row.company_id)?.name ?? "";

  const [losing, setLosing] = useState<BulkTarget<string> | null>(null);

  // Bulk edits change every selected deal at once; a refusal rolls them all back.
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, patch }: { ids: readonly string[]; patch: Partial<Deal> }) => {
      if (ids.length === 0) return;

      await collection
        .update([...ids], (drafts) => {
          for (const draft of drafts) Object.assign(draft, patch);
        })
        .when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkStage = (ids: readonly string[], stage: string, reason: string | null) =>
    bulkUpdate.mutate({
      ids: ids.filter((id) => deals.find((deal) => deal.id === id)?.stage !== stage),
      patch: { stage, closed_reason: reason, stage_changed_at: new Date().toISOString() },
    });

  const columns = dealColumns({ companiesById, memberOf, stageChange });

  return (
    <>
      <RecordTable
        archive={(ids, archived) => archive.mutate({ ids, archived })}
        blank={{ title: "No deals yet", description: "Press ⌥⇧D to open your first deal." }}
        columns={[...columns, ...custom.columns]}
        facetOf={{
          ...custom.facetOf,
          owner: (row) => row.owner_id ?? "none",
          stage: (row) => row.stage,
          closing: (row) => closingBucket(row, today) ?? "",
          status: statusOf,
        }}
        facets={[
          ownerFacet(members),
          {
            id: "stage",
            label: "Stage",
            options: DEAL_STAGES.map((stage) => ({ value: stage.id, label: stage.label })),
          },
          {
            id: "closing",
            label: "Closing",
            options: CLOSING_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label })),
          },
          STATUS_FACET,
          ...custom.facets,
        ]}
        haystack={(row) => `${row.name} ${companyName(row)} ${dealStage(row.stage).label}`}
        renderBulkActions={(ids, clear) => (
          <>
            <AssignOwnerMenu
              members={members}
              onAssign={(ownerId) => {
                bulkUpdate.mutate({ ids, patch: { owner_id: ownerId } });
                clear();
              }}
            />
            <SetStageMenu
              onPick={(stage) => {
                if (isLosingStage(stage)) setLosing({ ids: [...ids], value: stage });
                else bulkStage(ids, stage, null);

                clear();
              }}
            />
          </>
        )}
        kind="deal"
        label={(row) => row.name}
        loading={loading}
        meta={pipelineMeta(reporting)}
        noun={{ one: "deal", many: "deals" }}
        remove={(ids) => remove.mutate(ids)}
        removing={remove.isPending || archive.isPending || bulkUpdate.isPending}
        rows={deals}
        saved={{ workspaceId, userId }}
        searchParams={custom.searchParams}
        searchPlaceholder="Search deals by name or company…"
        sortValues={{
          ...custom.sortValues,
          name: (row) => row.name.toLowerCase(),
          company: (row) => companyName(row).toLowerCase(),
          stage: (row) => DEAL_STAGES.findIndex((stage) => stage.id === row.stage),
          amount: (row) => (row.amount === null ? -1 : Number(row.amount)),
          owner: (row) => nameOf(row.owner_id) ?? "",
          close: (row) => row.expected_close_date ?? "9999",
          createdAt: (row) => row.created_at,
          lastActivity: activityAt,
        }}
        tableId="deals"
        views={{
          label: "Deals",
          allLabel: "All deals",
          items: [
            { value: "open", label: "Open", test: (row) => isOpenStage(row.stage) },
            { value: "closed", label: "Closed", test: (row) => !isOpenStage(row.stage) },
          ],
        }}
      />
      <LosingReasonDialog
        onCancel={() => setLosing(null)}
        onConfirm={(target, reason) => {
          bulkStage(target.ids, target.value, reason);
          setLosing(null);
        }}
        target={losing}
      />
    </>
  );
}
