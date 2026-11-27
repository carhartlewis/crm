import type { CompanyStore, CompanyTx } from "./Companies.ts";

export interface MemoryCompany {
  id: string;
  workspaceId: string;
  name: string;
  domain: string | null;
  ownerId: string | null;
  updatedAt: number;
}

/**
 * In-memory `CompanyStore` for tests: members are `workspaceId:userId` pairs, txids count up,
 * and a transaction that throws leaves the rows unchanged.
 */
export function createMemoryCompanyStore(members: Iterable<string>, now = () => Date.now()) {
  const memberships = new Set(members);
  let rows = new Map<string, MemoryCompany>();
  let txid = 1000;

  const isMember = async (workspaceId: string, userId: string) =>
    memberships.has(`${workspaceId}:${userId}`);

  const store: CompanyStore = {
    isMember,
    transact: async (fn) => {
      const draft = new Map(rows);

      const tx: CompanyTx = {
        isMember,
        exists: async (id) => draft.has(id),
        insert: async (row) => {
          draft.set(row.id, { ...row, updatedAt: now() });
        },
        update: async (workspaceId, id, patch) => {
          const row = draft.get(id);

          if (row?.workspaceId !== workspaceId) return false;

          draft.set(id, { ...row, ...patch, updatedAt: now() });

          return true;
        },
        remove: async (workspaceId, id) =>
          draft.get(id)?.workspaceId === workspaceId && draft.delete(id),
      };

      const result = await fn(tx);

      rows = draft;
      txid += 1;

      return { result, txid };
    },
  };

  return { store, rows: () => rows };
}
