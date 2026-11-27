import { ResearchStatus } from "@crm/ui/components/research-status";
import { type ResearchRecord, researchStatus } from "../../lib/research-status.ts";

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
