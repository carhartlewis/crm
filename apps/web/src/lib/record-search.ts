import { useLiveQuery } from "@tanstack/react-db";
import { contactName, dealStage } from "@crm/core/records";
import { type Company, companiesCollection } from "./companies.ts";
import { type Contact, contactsCollection } from "./contacts.ts";
import { type Deal, dealsCollection } from "./deals.ts";
import type { RecordKind } from "./records.ts";

/** A record ⌘K can find; choosing it opens the record's sheet. */
export interface RecordHit {
  readonly kind: RecordKind;
  readonly id: string;
  readonly label: string;
  /**
   * Also searched, not shown: what people type when they look for the record without its name,
   * such as a company's domain or industry, or a contact's email, company or phone.
   */
  readonly keywords: readonly string[];
}

/** The values that are set, so empty fields add nothing to search. */
const present = (values: readonly (string | null | undefined)[]) =>
  values.flatMap((value) => (value?.trim() ? [value.trim()] : []));

/** A LinkedIn profile's handle (`ada-park` in `linkedin.com/in/ada-park`), or null. */
function linkedinHandle(url: string | null) {
  return url ? (/linkedin\.com\/in\/([^/?#]+)/i.exec(url)?.[1] ?? null) : null;
}

/** A phone number's digits, so `+1 (843) 607-8601` is found by typing `8436078601`. */
const phoneDigits = (phone: string | null) => phone?.replaceAll(/\D/g, "") || null;

export function companyHit(company: Company): RecordHit {
  return {
    kind: "company",
    id: company.id,
    label: company.name,
    keywords: present([
      company.domain,
      company.industry,
      company.city,
      company.country,
      company.email,
      phoneDigits(company.phone),
    ]),
  };
}

/** A contact, found by name or by their email, title, company, phone or LinkedIn handle. */
export function contactHit(contact: Contact, companyName: string | null): RecordHit {
  return {
    kind: "contact",
    id: contact.id,
    label: contactName(contact),
    keywords: present([
      contact.email,
      contact.title,
      companyName,
      phoneDigits(contact.phone),
      linkedinHandle(contact.linkedin_url),
    ]),
  };
}

/** A deal, found by name or by its company and stage. */
export function dealHit(deal: Deal, companyName: string | null): RecordHit {
  return {
    kind: "deal",
    id: deal.id,
    label: deal.name,
    keywords: present([companyName, dealStage(deal.stage).label]),
  };
}

/**
 * Every record ⌘K searches, read locally from synced collections (subscribing starts each sync),
 * so typing never waits on the network and a record added anywhere is found at once. The object
 * lists one source per record kind: a new kind fails type checking here until it has one.
 */
export function useRecordHits(workspaceId: string): readonly RecordHit[] {
  const companies =
    useLiveQuery({ query: (q) => q.from({ company: companiesCollection(workspaceId) }) }).data ??
    [];

  const contacts =
    useLiveQuery({ query: (q) => q.from({ contact: contactsCollection(workspaceId) }) }).data ?? [];

  const deals =
    useLiveQuery({ query: (q) => q.from({ deal: dealsCollection(workspaceId) }) }).data ?? [];

  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const nameOf = (id: string | null) => (id ? (companyNames.get(id) ?? null) : null);

  const byKind = {
    company: companies.filter((company) => !company.archived_at).map(companyHit),
    contact: contacts
      .filter((contact) => !contact.archived_at)
      .map((contact) => contactHit(contact, nameOf(contact.company_id))),
    deal: deals
      .filter((deal) => !deal.archived_at)
      .map((deal) => dealHit(deal, nameOf(deal.company_id))),
  } satisfies { readonly [K in RecordKind]: readonly RecordHit[] };

  return Object.values(byKind).flat();
}
