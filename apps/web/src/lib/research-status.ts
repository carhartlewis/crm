/** Research state comes from synced rows, including an optimistic row before its first write. */
export interface ResearchRecord {
  readonly enrichment_status: string;
  readonly enrichment_error: string | null;
  readonly archived_at: string | null;
}

export const researchActive = (record: ResearchRecord) =>
  !record.archived_at &&
  (record.enrichment_status === "pending" || record.enrichment_status === "running");

export interface ResearchStatus {
  readonly state: "queued" | "running" | "failed";
  readonly label: string;
  readonly detail: string;
}

/** A company keeps its indicator while its people's independent research finishes. */
export function researchStatus(record: ResearchRecord, people = 0): ResearchStatus | null {
  if (record.archived_at) return null;

  if (record.enrichment_status === "failed") {
    return {
      state: "failed",
      label: "Research interrupted",
      detail: "Saved details are kept. Open the record and run Research or Re-enrich to try again.",
    };
  }

  if (record.enrichment_status === "running") {
    return {
      state: "running",
      label: "Researching",
      detail: people
        ? `Filling in this company and researching ${people} ${people === 1 ? "person" : "people"}. Details appear as they are found.`
        : "Details appear as they are found. You can keep working and editing this record.",
    };
  }

  if (record.enrichment_status === "pending") {
    return {
      state: "queued",
      label: "Research queued",
      detail: "Waiting for research to start. You can use and edit this record now.",
    };
  }

  return people > 0
    ? {
        state: "running",
        label: `Researching ${people} ${people === 1 ? "person" : "people"}`,
        detail:
          "Company research has finished. Its contacts are still filling in their profiles and photos.",
      }
    : null;
}

/** One pass over the workspace's contacts; never count archived people. */
export function researchingPeople(
  contacts: readonly (ResearchRecord & { readonly company_id: string | null })[],
) {
  const counts = new Map<string, number>();

  for (const contact of contacts) {
    if (contact.company_id && researchActive(contact)) {
      counts.set(contact.company_id, (counts.get(contact.company_id) ?? 0) + 1);
    }
  }

  return counts;
}
