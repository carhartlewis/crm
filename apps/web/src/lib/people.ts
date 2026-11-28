import { findDuplicate, type PersonIdentity } from "@crm/core/records";
import { mutationOptions } from "@tanstack/react-query";
import { type CompaniesCollection, type Company, newCompany } from "./companies.ts";
import { type Contact, type ContactsCollection, newContact } from "./contacts.ts";
import type { PersonResultRow } from "./tool-results.ts";

/**
 * Adding people a search found (ADR 0027): each becomes a contact from `search`, at their
 * company (made first when it isn't in the CRM), and is then researched by itself.
 */

/** An email a provider says it checked. */
export const verifiedEmail = (status: string | null) =>
  status !== null && ["valid", "verified", "deliverable"].includes(status.toLowerCase());

/** The CRM company a person works at: by domain, then by name. */
export function companyFor(row: PersonResultRow, companies: readonly Company[]) {
  const domain = row.companyDomain?.toLowerCase();
  const name = row.company?.toLowerCase();

  return (
    companies.find((company) => !company.archived_at && domain && company.domain === domain) ??
    companies.find(
      (company) => !company.archived_at && name && company.name.toLowerCase() === name,
    ) ??
    null
  );
}

export function splitName(name: string) {
  const [first = name, ...rest] = name.trim().split(/\s+/);

  return { first, last: rest.join(" ") || null };
}

/** A synced contact as the duplicate rules (`@crm/core/records`) read it. */
export const contactIdentity = (contact: Contact) => ({
  firstName: contact.first_name,
  lastName: contact.last_name,
  email: contact.email,
  linkedinUrl: contact.linkedin_url,
  companyId: contact.company_id,
  archived: Boolean(contact.archived_at),
});

/** A search row as the duplicate rules read it, at its CRM company when there is one. */
function rowIdentity(row: PersonResultRow, companies: readonly Company[]): PersonIdentity {
  const { first, last } = splitName(row.name);

  return {
    firstName: first,
    lastName: last,
    email: row.email,
    linkedinUrl: row.linkedinUrl,
    companyId: companyFor(row, companies)?.id ?? null,
  };
}

/**
 * The CRM contact a search row already is: the id the search found, or the same LinkedIn
 * profile, email, or name at the same company (the API's rules, so "In CRM" matches what it
 * would refuse).
 */
export function contactFor(
  row: PersonResultRow,
  contacts: readonly Contact[],
  companies: readonly Company[],
) {
  const known = row.contactId ? contacts.find((contact) => contact.id === row.contactId) : null;

  return (
    known ?? findDuplicate(rowIdentity(row, companies), contacts, contactIdentity)?.contact ?? null
  );
}

interface AddPeople {
  readonly people: readonly PersonResultRow[];
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly companies: readonly Company[];
  /** The workspace's contacts, so nobody already there is added again. */
  readonly contacts: readonly Contact[];
  readonly companyRows: CompaniesCollection;
  readonly contactRows: ContactsCollection;
}

export const addPeopleMutation = mutationOptions({
  mutationKey: ["people", "add"],
  mutationFn: async ({
    people,
    workspaceId,
    ownerId,
    companies,
    contacts,
    companyRows,
    contactRows,
  }: AddPeople) => {
    // Companies made in this batch, so two people at one new company share it.
    const made = new Map<string, Company>();
    // Contacts so far, this batch's included, so one person listed twice is added once.
    const known = [...contacts];
    let added = 0;

    for (const row of people) {
      const key = (row.companyDomain ?? row.company ?? "").toLowerCase();
      const every = [...companies, ...made.values()];

      if (contactFor(row, known, every)) continue;

      let company = companyFor(row, companies) ?? made.get(key) ?? null;

      if (!company && row.company) {
        company = newCompany({
          workspaceId,
          ownerId,
          name: row.company,
          domain: row.companyDomain,
        });
        made.set(key, company);
        // oxlint-disable-next-line no-await-in-loop -- the contact links to it.
        await companyRows.insert(company).when("settled");
      }

      const { first, last } = splitName(row.name);

      const contact = newContact(workspaceId, ownerId, {
        first_name: first,
        last_name: last,
        title: row.title,
        // Only a checked address; research finds and checks the rest.
        email: verifiedEmail(row.emailStatus) ? row.email : null,
        phone: null,
        company_id: company?.id ?? null,
        linkedin_url: row.linkedinUrl,
        source: "search",
      });

      known.push(contact);
      added += 1;

      // oxlint-disable-next-line no-await-in-loop -- one at a time keeps the order and the txids.
      await contactRows.insert(contact).when("settled");
    }

    return added;
  },
});
