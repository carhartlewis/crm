import type { Company } from "@crm/core/api";
import { RecordKnowledge } from "../records/record-knowledge.tsx";

/** How long a new company's memory waits for its website research to arrive. */
const RESEARCH_WAIT_MS = 3 * 60 * 1000;

/** A company's memory in its record sheet, waiting for a new company's website research. */
export function CompanyKnowledge({
  userId,
  workspaceId,
  company,
}: {
  userId: string;
  workspaceId: string;
  company: Company;
}) {
  // Research starts when a company with a domain is created (ADR 0025).
  const expectUntil = company.domain ? Date.parse(company.created_at) + RESEARCH_WAIT_MS : 0;

  return (
    <RecordKnowledge
      userId={userId}
      workspaceId={workspaceId}
      target={{ companyId: company.id }}
      subject={company.name}
      expectUntil={expectUntil}
    />
  );
}
