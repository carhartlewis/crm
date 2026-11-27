import { useLiveQuery } from "@tanstack/react-db";
import { contactName, dealStage } from "@crm/core/records";
import { companiesCollection } from "./companies.ts";
import { contactsCollection } from "./contacts.ts";
import { dealsCollection } from "./deals.ts";
import type { RecordKind } from "./records.ts";

/** A record ⌘K can find; choosing it opens the record's sheet. */
export interface RecordHit {
  readonly kind: RecordKind;
  readonly id: string;
  readonly label: string;
  /** Also searched, not shown: a company's domain, a contact's email and title. */
  readonly keywords: readonly string[];
}

/** The workspace's companies, from the synced collection (subscribing starts its sync). */
function useCompanyHits(workspaceId: string): readonly RecordHit[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ company: companiesCollection(workspaceId) }),
  });

  return data
    .filter((company) => !company.archived_at)
    .map((company) => ({
      kind: "company",
      id: company.id,
      label: company.name,
      keywords: company.domain ? [company.domain] : [],
    }));
}

function useContactHits(workspaceId: string): readonly RecordHit[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ contact: contactsCollection(workspaceId) }),
  });

  return data
    .filter((contact) => !contact.archived_at)
    .map((contact) => ({
      kind: "contact",
      id: contact.id,
      label: contactName(contact),
      keywords: [contact.email, contact.title].filter((value) => value !== null),
    }));
}

function useDealHits(workspaceId: string): readonly RecordHit[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ deal: dealsCollection(workspaceId) }),
  });

  return data
    .filter((deal) => !deal.archived_at)
    .map((deal) => ({
      kind: "deal",
      id: deal.id,
      label: deal.name,
      keywords: [dealStage(deal.stage).label],
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
    contact: useContactHits(workspaceId),
    deal: useDealHits(workspaceId),
  } satisfies { readonly [K in RecordKind]: readonly RecordHit[] };

  return Object.values(byKind).flat();
}
