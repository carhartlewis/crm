import type { Db } from "@crm/core/db";
import { type DbTx, transactWithTxid } from "./txid.ts";

/** The CRM record tables written through the API. */
export type RecordTable = "company" | "contact" | "deal" | "activity";

/** A `jsonb` value, such as an activity's `meta`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** One column's value as the ORM reads or writes it: text, numbers, flags, timestamps or JSON. */
export type RecordValue = JsonValue | Date | undefined;

/** A row as the ORM names its fields (camelCase), never the snake_case synced columns. */
export type RecordRow = Readonly<Record<string, RecordValue>>;

/** Columns being built up for one write, before they go to `insert` or `update`. */
export type RecordPatch = Record<string, RecordValue>;

export interface DealContactRow {
  readonly dealId: string;
  readonly contactId: string;
  readonly workspaceId: string;
  readonly role: string | null;
}

/** Row operations inside one transaction. Every write and read is scoped by workspace. */
export interface RecordTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  /** Whether any row has this id, in any workspace: ids are never reused. */
  exists(table: RecordTable, id: string): Promise<boolean>;
  get(table: RecordTable, workspaceId: string, id: string): Promise<RecordRow | null>;
  insert(table: RecordTable, row: RecordRow): Promise<void>;
  /**
   * `false` when no row has this id in this workspace. Always stamps `updatedAt`, so even an
   * empty patch changes the row and its txid reaches the shape.
   */
  update(table: RecordTable, workspaceId: string, id: string, patch: RecordRow): Promise<boolean>;
  remove(table: RecordTable, workspaceId: string, id: string): Promise<boolean>;
  /** The contacts at a company, archived ones included. */
  contactsAt(workspaceId: string, companyId: string): Promise<readonly RecordRow[]>;
  /**
   * Contacts that might be this person, archived ones included: the same email, a LinkedIn URL
   * that names this handle, or the same company. The caller decides which ones match.
   */
  contactCandidates(
    workspaceId: string,
    person: {
      readonly email: string | null;
      readonly linkedinHandle: string | null;
      readonly companyId: string | null;
    },
  ): Promise<readonly RecordRow[]>;
  /** Holds `key` until the transaction ends, so two writes that check-then-insert take turns. */
  lock(key: string): Promise<void>;
  /** Adds the contact to the deal, or sets their role when already on it. */
  putDealContact(row: DealContactRow): Promise<void>;
  removeDealContact(workspaceId: string, dealId: string, contactId: string): Promise<boolean>;
}

/** Runs `fn` in one Postgres transaction and returns its result with that transaction's id. */
export interface RecordStore {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  transact<A>(fn: (tx: RecordTx) => Promise<A>): Promise<{ result: A; txid: number }>;
}

/**
 * The ORM collections by table. Their row types differ, so this module talks to them through
 * the operations every collection shares; callers pass rows the contract accepts.
 */
interface Collection {
  where(filter: RecordRow): {
    first(): Promise<RecordRow | null>;
    update(patch: RecordRow): Promise<RecordRow | null>;
    delete(): Promise<RecordRow | null>;
  };
  create(row: RecordRow): Promise<RecordRow>;
}

/** What this module needs of an ORM collection, whatever its row type. */
interface OrmCollection {
  where(filter: never): {
    first(): Promise<object | null>;
    update(patch: never): Promise<object | null>;
    delete(): Promise<object | null>;
  };
  create(row: never): Promise<object>;
}

/**
 * One ORM collection behind the shared `Collection` operations. Its own row type is narrower
 * than `RecordRow`; callers pass rows its contract accepts (the HttpApi schema and the record
 * rules decide the fields), and every row it returns is a record of column values.
 */
function collection(orm: OrmCollection): Collection {
  return {
    where: (filter) => {
      // SAFETY: `filter` names only this table's columns (see above).
      const query = orm.where(filter as never);

      return {
        // SAFETY: the ORM returns a row of column values, or `null`.
        first: async () => (await query.first()) as RecordRow | null,
        // SAFETY: `patch` names only this table's columns; the ORM returns the row or `null`.
        update: async (patch) => (await query.update(patch as never)) as RecordRow | null,
        // SAFETY: the ORM returns the deleted row, or `null`.
        delete: async () => (await query.delete()) as RecordRow | null,
      };
    },
    // SAFETY: `row` holds this table's required columns (see above); the ORM returns the row.
    create: async (row) => (await orm.create(row as never)) as RecordRow,
  };
}

function recordTx(tx: DbTx): RecordTx {
  const orm = tx.orm.public;

  const tables: Record<RecordTable, Collection> = {
    company: collection(orm.Company),
    contact: collection(orm.Contact),
    deal: collection(orm.Deal),
    activity: collection(orm.Activity),
  };

  const dealContacts = collection(orm.DealContact);

  return {
    isMember: async (workspaceId, userId) =>
      (await orm.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    exists: async (table, id) => (await tables[table].where({ id }).first()) !== null,
    get: async (table, workspaceId, id) =>
      (await tables[table].where({ id, workspaceId }).first()) ?? null,
    insert: async (table, row) => {
      await tables[table].create({ ...row });
    },
    update: async (table, workspaceId, id, patch) =>
      (await tables[table]
        .where({ id, workspaceId })
        .update({ ...patch, updatedAt: new Date() })) !== null,
    remove: async (table, workspaceId, id) =>
      (await tables[table].where({ id, workspaceId }).delete()) !== null,
    contactsAt: async (workspaceId, companyId) =>
      await orm.Contact.where({ workspaceId, companyId }).all(),
    contactCandidates: async (workspaceId, { email, linkedinHandle, companyId }) => {
      const found = new Map<string, RecordRow>();

      const add = (rows: readonly RecordRow[]) => {
        for (const row of rows) found.set(String(row["id"]), row);
      };

      // Stored emails are lower case (`optionalEmail`).
      if (email) add(await orm.Contact.where({ workspaceId, email }).all());

      if (linkedinHandle) {
        // A wide net (`_` and a longer handle also match); the caller compares handles exactly.
        add(
          await orm.Contact.where({ workspaceId })
            .where((contact) => contact.linkedinUrl.ilike(`%linkedin.com/in/${linkedinHandle}%`))
            .all(),
        );
      }

      if (companyId) add(await orm.Contact.where({ workspaceId, companyId }).all());

      return [...found.values()];
    },
    lock: async (key) => {
      await tx.query(
        tx.raw
          .sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS held`
          .returnsRow({ locked: "pg/int4@1" })
          .build(),
      );
    },
    putDealContact: async (row) => {
      const key = { dealId: row.dealId, contactId: row.contactId, workspaceId: row.workspaceId };

      if ((await dealContacts.where(key).first()) === null) {
        await dealContacts.create({ ...row });
      } else {
        await dealContacts.where(key).update({ role: row.role });
      }
    },
    removeDealContact: async (workspaceId, dealId, contactId) =>
      (await dealContacts.where({ workspaceId, dealId, contactId }).delete()) !== null,
  };
}

/** The Prisma 8 store: ORM writes plus `pg_current_xact_id()` in the same transaction. */
export function prismaRecordStore(db: Db): RecordStore {
  return {
    isMember: async (workspaceId, userId) =>
      (await db.orm.public.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    transact: (fn) => transactWithTxid(db, (tx) => fn(recordTx(tx))),
  };
}
