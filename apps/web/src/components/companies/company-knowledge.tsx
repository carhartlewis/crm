import type { Company } from "@crm/core/api";
import { MemoryActions, MemoryView } from "../memory/memory-view.tsx";

/** A company's memory in its record sheet: the graph, plus notes and website research. */
export function CompanyKnowledge({
  userId,
  workspaceId,
  company,
}: {
  userId: string;
  workspaceId: string;
  company: Company;
}) {
  const target = { companyId: company.id };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <MemoryActions target={target} canResearch={company.domain !== null} />
      </div>
      <MemoryView
        userId={userId}
        workspaceId={workspaceId}
        target={target}
        subject={company.name}
      />
    </div>
  );
}
