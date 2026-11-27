import { DayCell } from "@crm/ui/patterns/data-table/table-cells";
import { RailFacts } from "@crm/ui/patterns/record-sheet/record-rail";
import { RecordHeader, RecordSheet } from "@crm/ui/patterns/record-sheet/record-sheet";
import { useRecordSheetParams } from "@crm/ui/patterns/record-sheet/use-record-sheet-params";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import { toast } from "sonner";
import { companiesCollection, updateCompanyMutation } from "../../lib/companies.ts";
import { RECORD_TABS } from "../../lib/records.ts";
import { workspaceQuery } from "../../lib/session.ts";
import { CompanyForm } from "./company-form.tsx";
import { CompanyKnowledge } from "./company-knowledge.tsx";

export interface CompanySheetProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * A company's sheet (`?company=<id>`), mounted once in the shell so it opens over any page: from
 * the Companies table or from ⌘K. It reads the synced companies, so it renders with no request.
 */
export default function CompanySheet({ userId, workspaceId }: CompanySheetProps) {
  const collection = companiesCollection(workspaceId);
  const record = useRecordSheetParams({ recordKey: "company", tabs: RECORD_TABS.company });

  const { data: rows = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ company: collection }),
  });

  const { data: workspace } = useQuery(workspaceQuery(userId, workspaceId));

  const ownerName = (ownerId: string | null) =>
    workspace?.members.find((member) => member.userId === ownerId)?.user.name ?? null;

  const update = useMutation({
    ...updateCompanyMutation,
    onSuccess: () => toast.success("Company saved"),
    onError: (error) => toast.error(error.message),
  });

  const current = rows.find((row) => row.id === record.id);
  const open = record.id !== null;

  return (
    <RecordSheet
      open={open}
      onClose={() => void record.close()}
      label="Company"
      loading={open && !current && isLoading}
      tab={record.tab}
      onTabChange={(tab) => void record.setTab(tab)}
      header={current ? <RecordHeader title={current.name} /> : null}
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: current ? (
            <div className="max-w-md p-4">
              <CompanyForm
                // A different company starts a fresh form.
                key={current.id}
                initial={{ name: current.name, domain: current.domain }}
                submitLabel="Save"
                onSubmit={async (input) => {
                  await update.mutateAsync({ collection, id: current.id, input });
                }}
              />
            </div>
          ) : null,
        },
        {
          id: "knowledge",
          label: "Knowledge",
          content: current ? (
            <div className="p-4">
              <CompanyKnowledge
                key={current.id}
                userId={userId}
                workspaceId={workspaceId}
                company={current}
              />
            </div>
          ) : null,
        },
      ]}
      rail={
        current ? (
          <RailFacts
            facts={[
              { kind: "person", label: "Owner", value: ownerName(current.owner_id) ?? "—" },
              { kind: "property", label: "Domain", value: current.domain ?? "—" },
              { kind: "date", label: "Created", value: <DayCell value={current.created_at} /> },
              {
                kind: "date",
                label: "Last change",
                value: <DayCell value={current.updated_at} />,
              },
            ]}
          />
        ) : null
      }
    />
  );
}
