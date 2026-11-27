import type { CompanyRow, ContactRow, DealRow, MemoryDirectory, WorkspaceRow } from "./Memory.ts";

function strip({ id, name, domain }: CompanyRow): CompanyRow {
  return { id, name, domain };
}

/**
 * In-memory `MemoryDirectory` for tests: members are `workspaceId:userId` pairs, and companies,
 * contacts and deals carry the workspace they belong to.
 */
export function createMemoryDirectory(seed: {
  members?: Iterable<string>;
  workspaces?: readonly WorkspaceRow[];
  companies?: readonly (CompanyRow & { workspaceId: string })[];
  contacts?: readonly (ContactRow & { workspaceId: string })[];
  deals?: readonly (DealRow & { workspaceId: string })[];
  users?: Readonly<Record<string, string>>;
}): MemoryDirectory {
  const members = new Set(seed.members ?? []);
  const workspaces = new Map((seed.workspaces ?? []).map((row) => [row.id, row]));
  const companies = seed.companies ?? [];

  return {
    isMember: async (workspaceId, userId) => members.has(`${workspaceId}:${userId}`),
    workspace: async (id) => workspaces.get(id) ?? null,
    company: async (workspaceId, id) => {
      const row = companies.find(
        (company) => company.workspaceId === workspaceId && company.id === id,
      );

      return row ? strip(row) : null;
    },
    companies: async (workspaceId) =>
      companies.filter((company) => company.workspaceId === workspaceId).map(strip),
    contact: async (workspaceId, id) => {
      const row = seed.contacts?.find(
        (contact) => contact.workspaceId === workspaceId && contact.id === id,
      );

      return row
        ? { id: row.id, name: row.name, title: row.title, companyName: row.companyName }
        : null;
    },
    deal: async (workspaceId, id) => {
      const row = seed.deals?.find((deal) => deal.workspaceId === workspaceId && deal.id === id);

      return row ? { id: row.id, name: row.name, companyName: row.companyName } : null;
    },
    userName: async (id) => seed.users?.[id] ?? null,
  };
}
