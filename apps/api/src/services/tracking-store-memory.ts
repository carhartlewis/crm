import type { NewVisit, TrackingStore, VisitorMatch } from "./tracking-store.ts";

interface MemoryContact {
  readonly id: string;
  readonly workspaceId: string;
  readonly email: string | null;
  readonly companyId: string | null;
  readonly archived?: boolean;
}

interface MemoryCompany {
  readonly id: string;
  readonly workspaceId: string;
  readonly domain: string | null;
}

/** In-memory `TrackingStore` for tests: members are `workspaceId:userId` pairs. */
export function createMemoryTrackingStore(seed: {
  members: Iterable<string>;
  contacts?: readonly MemoryContact[];
  companies?: readonly MemoryCompany[];
}) {
  const members = new Set(seed.members);
  const keys = new Map<string, string | null>();
  const contacts = [...(seed.contacts ?? [])];
  const companies = [...(seed.companies ?? [])];
  const visits: NewVisit[] = [];

  const store: TrackingStore = {
    isMember: async (workspaceId, userId) => members.has(`${workspaceId}:${userId}`),
    trackingKey: async (workspaceId) => keys.get(workspaceId) ?? null,
    setTrackingKey: async (workspaceId, key) => {
      keys.set(workspaceId, key);
    },
    workspaceForKey: async (key) => [...keys].find(([, value]) => value === key)?.[0] ?? null,
    recordExists: async (table, workspaceId, id) =>
      (table === "company" ? companies : contacts).some(
        (row) => row.id === id && row.workspaceId === workspaceId,
      ),
    contactByEmail: async (workspaceId, email) => {
      const matches = contacts.filter(
        (row) => row.workspaceId === workspaceId && row.email === email,
      );

      const contact = matches.find((row) => !row.archived) ?? matches[0];

      return contact ? { id: contact.id, companyId: contact.companyId } : null;
    },
    companyByDomain: async (workspaceId, domain) =>
      companies.find((row) => row.workspaceId === workspaceId && row.domain === domain)?.id ?? null,
    visitorMatch: async (workspaceId, visitorId) => {
      const latest = visits
        .filter((visit) => visit.workspaceId === workspaceId && visit.visitorId === visitorId)
        .toSorted((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];

      return latest && (latest.contactId || latest.companyId)
        ? { contactId: latest.contactId, companyId: latest.companyId }
        : null;
    },
    matchVisitor: async (workspaceId, visitorId, match: VisitorMatch) => {
      for (const [index, visit] of visits.entries()) {
        if (visit.workspaceId !== workspaceId || visit.visitorId !== visitorId) continue;

        visits[index] = {
          ...visit,
          contactId: match.contactId ?? visit.contactId,
          companyId: match.companyId ?? visit.companyId,
        };
      }
    },
    insertVisit: async (visit) => {
      visits.push(visit);
    },
    visits: async (workspaceId, target) =>
      visits.filter(
        (visit) =>
          visit.workspaceId === workspaceId &&
          ("companyId" in target
            ? visit.companyId === target.companyId
            : visit.contactId === target.contactId),
      ),
  };

  return { store, visits: () => visits, keys };
}
