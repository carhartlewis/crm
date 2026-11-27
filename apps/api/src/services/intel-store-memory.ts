import type { BriefRow, FactRow, IntelStore, IntelTx, RecordRef } from "./Intel.ts";
import type { JsonValue } from "./record-store.ts";

type Table = "company" | "contact" | "deal";

/** A record row as the fake keeps it. */
export interface FakeRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly companyId?: string | null;
  readonly lastActivityAt?: Date | null;
  readonly enrichmentStatus?: string;
  readonly enrichedAt?: Date | null;
  readonly enrichmentError?: string | null;
}

export interface FakeActivity {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly source: string;
  readonly subject: string;
  readonly body: string | null;
  readonly occurredAt: Date;
  readonly companyId: string | null;
  readonly contactId: string | null;
  readonly dealId: string | null;
  readonly externalUrl: string | null;
  readonly meta: JsonValue;
  readonly createdById: string;
  readonly emailThreadId: string | null;
  readonly calendarEventId: string | null;
}

interface FactState extends FactRow {
  readonly decidedById?: string | null;
  readonly decidedAt?: Date | null;
}

interface State {
  records: Record<Table, Map<string, FakeRecord>>;
  facts: Map<string, FactState>;
  briefs: Map<string, BriefRow>;
  activities: Map<string, FakeActivity>;
}

const clone = (state: State): State => ({
  records: {
    company: new Map(state.records.company),
    contact: new Map(state.records.contact),
    deal: new Map(state.records.deal),
  },
  facts: new Map(state.facts),
  briefs: new Map(state.briefs),
  activities: new Map(state.activities),
});

/**
 * In-memory `IntelStore` for tests: members are `workspaceId:userId` pairs, txids count up, and a
 * transaction that throws leaves everything unchanged.
 */
export function createMemoryIntelStore(members: Iterable<string>) {
  const memberships = new Set(members);

  let state: State = {
    records: { company: new Map(), contact: new Map(), deal: new Map() },
    facts: new Map(),
    briefs: new Map(),
    activities: new Map(),
  };

  let txid = 2000;

  const store: IntelStore = {
    transact: async (fn) => {
      const draft = clone(state);

      const inWorkspace = (table: Table, workspaceId: string, id: string) => {
        const row = draft.records[table].get(id);

        return row?.workspaceId === workspaceId ? row : null;
      };

      const tx: IntelTx = {
        isMember: async (workspaceId, userId) => memberships.has(`${workspaceId}:${userId}`),
        record: async (table, workspaceId, id): Promise<RecordRef | null> => {
          const row = inWorkspace(table, workspaceId, id);

          if (!row) return null;

          return {
            companyId: table === "company" ? row.id : (row.companyId ?? null),
            lastActivityAt: row.lastActivityAt ?? null,
          };
        },
        setEnrichment: async (table, workspaceId, id, patch) => {
          const row = inWorkspace(table, workspaceId, id);

          if (row) draft.records[table].set(id, { ...row, ...patch });
        },
        touch: async (table, workspaceId, id, at) => {
          const row = inWorkspace(table, workspaceId, id);

          if (row && (!row.lastActivityAt || row.lastActivityAt < at)) {
            draft.records[table].set(id, { ...row, lastActivityAt: at });
          }
        },
        fact: async (workspaceId, id) => {
          const fact = draft.facts.get(id);

          return fact?.workspaceId === workspaceId ? fact : null;
        },
        factIds: async (workspaceId, contactId, field, status) =>
          [...draft.facts.values()].flatMap((fact) =>
            fact.workspaceId === workspaceId &&
            fact.contactId === contactId &&
            fact.field === field &&
            fact.status === status
              ? [fact.id]
              : [],
          ),
        insertFact: async (row) => {
          draft.facts.set(row.id, row);
        },
        updateFact: async (workspaceId, id, patch) => {
          const fact = draft.facts.get(id);

          if (fact?.workspaceId === workspaceId) draft.facts.set(id, { ...fact, ...patch });
        },
        putBrief: async (row) => {
          draft.briefs.set(row.contactId, row);
        },
        activityBy: async (workspaceId, key, value) =>
          [...draft.activities.values()].find(
            (activity) => activity.workspaceId === workspaceId && activity[key] === value,
          )?.id ?? null,
        insertActivity: async (row) => {
          draft.activities.set(row.id, row);
        },
        updateActivity: async (workspaceId, id, row) => {
          const activity = draft.activities.get(id);

          if (activity?.workspaceId === workspaceId) {
            draft.activities.set(id, { ...activity, ...row });
          }
        },
      };

      const result = await fn(tx);

      state = draft;
      txid += 1;

      return { result, txid };
    },
  };

  return {
    store,
    /** Adds a company, contact or deal row. */
    seed: (table: Table, row: FakeRecord) => {
      state.records[table].set(row.id, row);
    },
    record: (table: Table, id: string) => state.records[table].get(id),
    facts: () => [...state.facts.values()],
    brief: (contactId: string) => state.briefs.get(contactId),
    activities: () => [...state.activities.values()],
  };
}
