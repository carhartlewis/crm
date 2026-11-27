import { useLiveQuery } from "@tanstack/react-db";
import { companiesCollection } from "./companies.ts";
import type { RecordKind } from "./records.ts";

/** A record ⌘K can find; choosing it opens the record's sheet. */
export interface RecordHit {
  readonly kind: RecordKind;
  readonly id: string;
  readonly label: string;
  /** Also searched, not shown: a company's domain. */
  readonly keywords: readonly string[];
}

/** The workspace's companies, from the synced collection (subscribing starts its sync). */
function useCompanyHits(workspaceId: string): readonly RecordHit[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ company: companiesCollection(workspaceId) }),
  });

  return data.map((company) => ({
    kind: "company",
    id: company.id,
    label: company.name,
    keywords: company.domain ? [company.domain] : [],
  }));
}

/**
 * Every record ⌘K searches, read locally from synced collections, so typing never waits on the
 * network. The object lists one source per record kind: a new kind fails type checking here
 * until it has one.
 */
export function useRecordHits(workspaceId: string): readonly RecordHit[] {
  const byKind = {
    company: useCompanyHits(workspaceId),
  } satisfies { readonly [K in RecordKind]: readonly RecordHit[] };

  return Object.values(byKind).flat();
}
