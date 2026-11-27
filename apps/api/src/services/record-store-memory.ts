import type {
  DealContactRow,
  RecordRow,
  RecordStore,
  RecordTable,
  RecordTx,
} from "./record-store.ts";

type Tables = Record<RecordTable, Map<string, RecordRow>>;

const emptyTables = (): Tables => ({
  company: new Map(),
  contact: new Map(),
  deal: new Map(),
  activity: new Map(),
});

const copy = (tables: Tables): Tables => ({
  company: new Map(tables.company),
  contact: new Map(tables.contact),
  deal: new Map(tables.deal),
  activity: new Map(tables.activity),
});

/**
 * In-memory `RecordStore` for tests: members are `workspaceId:userId` pairs, txids count up, a
 * transaction that throws leaves the rows unchanged, and `updatedAt` comes from `now`.
 */
export function createMemoryRecordStore(members: Iterable<string>, now = () => Date.now()) {
  const memberships = new Set(members);
  let tables = emptyTables();
  let dealContacts = new Map<string, DealContactRow>();
  let txid = 1000;

  const isMember = async (workspaceId: string, userId: string) =>
    memberships.has(`${workspaceId}:${userId}`);

  const store: RecordStore = {
    isMember,
    transact: async (fn) => {
      const draft = copy(tables);
      const draftLinks = new Map(dealContacts);

      const inWorkspace = (table: RecordTable, workspaceId: string, id: string) => {
        const row = draft[table].get(id);

        return row?.["workspaceId"] === workspaceId ? row : null;
      };

      const tx: RecordTx = {
        isMember,
        exists: async (table, id) => draft[table].has(id),
        get: async (table, workspaceId, id) => inWorkspace(table, workspaceId, id),
        insert: async (table, row) => {
          draft[table].set(String(row["id"]), { ...row, updatedAt: now() });
        },
        update: async (table, workspaceId, id, patch) => {
          const row = inWorkspace(table, workspaceId, id);

          if (!row) return false;

          draft[table].set(id, { ...row, ...patch, updatedAt: now() });

          return true;
        },
        remove: async (table, workspaceId, id) => {
          if (!inWorkspace(table, workspaceId, id)) return false;

          draft[table].delete(id);

          // The database cascades: a company takes its deals, a deal its links and activity.
          if (table === "company") {
            for (const [dealId, deal] of draft.deal) {
              if (deal["companyId"] === id) draft.deal.delete(dealId);
            }
          }

          for (const [key, link] of draftLinks) {
            if (link.dealId === id || link.contactId === id) draftLinks.delete(key);
          }

          return true;
        },
        contactsAt: async (workspaceId, companyId) =>
          [...draft.contact.values()].filter(
            (row) => row["workspaceId"] === workspaceId && row["companyId"] === companyId,
          ),
        putDealContact: async (row) => {
          draftLinks.set(`${row.dealId}:${row.contactId}`, row);
        },
        removeDealContact: async (workspaceId, dealId, contactId) => {
          const key = `${dealId}:${contactId}`;

          return draftLinks.get(key)?.workspaceId === workspaceId && draftLinks.delete(key);
        },
      };

      const result = await fn(tx);

      tables = draft;
      dealContacts = draftLinks;
      txid += 1;

      return { result, txid };
    },
  };

  return {
    store,
    /** The companies, as the ORM names their fields. */
    rows: () => tables.company,
    table: (name: RecordTable) => tables[name],
    dealContacts: () => dealContacts,
  };
}

/** The companies-only name older tests use. */
export const createMemoryCompanyStore = createMemoryRecordStore;
