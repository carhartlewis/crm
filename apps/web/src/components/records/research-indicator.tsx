import { ResearchStatus } from "@crm/ui/components/research-status";
import {
  activityStatus,
  type ResearchRecord,
  researchActivity,
  researchStatus,
} from "../../lib/research-status.ts";
import { useCompanies, useContacts } from "./use-crm.ts";

export function ResearchIndicator({
  record,
  people = 0,
  compact = false,
}: {
  record: ResearchRecord;
  people?: number;
  compact?: boolean;
}) {
  const status = researchStatus(record, people);

  return status ? <ResearchStatus {...status} compact={compact} /> : null;
}

/**
 * The workspace's research at a glance, for a list page's header: counted from the synced
 * companies and contacts, so it changes the moment the queue starts or ends a session (ADR 0030).
 */
export function ResearchActivity({ workspaceId }: { workspaceId: string }) {
  const { companies } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const status = activityStatus(researchActivity([...companies, ...contacts]));

  return status ? <ResearchStatus {...status} /> : null;
}
