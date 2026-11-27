import type { CompanyRow, MemoryDirectory, WorkspaceRow } from "./Memory.ts";

function strip({ id, name, domain }: CompanyRow): CompanyRow {
  return { id, name, domain };
}

/**
 * In-memory `MemoryDirectory` for tests: members are `workspaceId:userId` pairs, and companies
 * carry the workspace they belong to.
 */
export function createMemoryDirectory(seed: {
  members?: Iterable<string>;
  workspaces?: readonly WorkspaceRow[];
  companies?: readonly (CompanyRow & { workspaceId: string })[];
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
    userName: async (id) => seed.users?.[id] ?? null,
  };
}
