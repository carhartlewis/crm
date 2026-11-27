import type { Company } from "@crm/core/api";
import { MemoryActions, MemoryView } from "../memory/memory-view.tsx";

/** How long a new company's memory waits for its website research to arrive. */
const RESEARCH_WAIT_MS = 3 * 60 * 1000;

/** A company's memory in its record sheet: the graph, filling the tab, plus notes. */
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

  // Research starts when a company with a domain is created (ADR 0025).
  const expectUntil = company.domain ? Date.parse(company.created_at) + RESEARCH_WAIT_MS : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex justify-end">
        <MemoryActions />
      </div>
      <MemoryView
        userId={userId}
        workspaceId={workspaceId}
        target={target}
        subject={company.name}
        expectUntil={expectUntil}
        fill
      />
    </div>
  );
}
