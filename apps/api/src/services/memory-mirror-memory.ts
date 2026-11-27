import type { FactMirror, MirroredFact } from "./memory-mirror.ts";

export interface MirrorRow extends MirroredFact {
  readonly workspaceId: string;
  readonly companyId: string | null;
}

/** In-memory `FactMirror` for tests; `rows()` shows the copy. */
export function createMemoryFactMirror() {
  const rows = new Map<string, MirrorRow>();

  const mirror: FactMirror = {
    replace: async (workspaceId, companyId, facts) => {
      for (const [id, row] of rows) {
        if (row.workspaceId === workspaceId && row.companyId === companyId) rows.delete(id);
      }

      for (const fact of facts) rows.set(fact.id, { ...fact, workspaceId, companyId });
    },
    remove: async (workspaceId, factIds) => {
      for (const id of factIds) {
        if (rows.get(id)?.workspaceId === workspaceId) rows.delete(id);
      }
    },
  };

  return { mirror, rows: () => [...rows.values()] };
}
