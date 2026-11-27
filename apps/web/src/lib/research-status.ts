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

const contactCount = (count: number) => `${count} ${count === 1 ? "contact" : "contacts"}`;

/** A company keeps its indicator while its contacts' independent research finishes. */
export function researchStatus(record: ResearchRecord, people = 0): ResearchStatus | null {
  if (record.archived_at) return null;

  if (record.enrichment_status === "failed") {
    return {
      state: "failed",
      label: "Research interrupted",
      detail: "Saved details are kept. Use Re-enrich to try again.",
    };
  }

  if (record.enrichment_status === "running") {
    return {
      state: "running",
      label: "Researching",
      detail: people
        ? `Researching this company and ${contactCount(people)}. Details appear as they are found.`
        : "Details appear as they are found.",
    };
  }

  if (record.enrichment_status === "pending") {
    return {
      state: "queued",
      label: "Research queued",
      detail: "Waiting for a research slot. It starts on its own.",
    };
  }

  return people > 0
    ? {
        state: "running",
        label: `Researching ${contactCount(people)}`,
        detail: "Details appear as they are found.",
      }
    : null;
}

/** The workspace's research right now: sessions running, and records waiting in the queue. */
export function researchActivity(records: readonly ResearchRecord[]) {
  let running = 0;
  let queued = 0;

  for (const record of records) {
    if (record.archived_at) continue;

    if (record.enrichment_status === "running") running += 1;
    else if (record.enrichment_status === "pending") queued += 1;
  }

  return { running, queued };
}

/** The page header's summary; null when nothing is being researched. */
export function activityStatus({
  running,
  queued,
}: {
  running: number;
  queued: number;
}): ResearchStatus | null {
  if (running === 0 && queued === 0) return null;

  const waiting = `${queued} queued`;

  return {
    state: running > 0 ? "running" : "queued",
    label:
      running > 0
        ? queued > 0
          ? `Researching ${running} · ${waiting}`
          : `Researching ${running}`
        : waiting,
    detail:
      queued > 0
        ? "A few records are researched at a time. Queued records start on their own as others finish."
        : "Details appear as they are found.",
  };
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
