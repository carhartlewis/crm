import type { Pool, PoolClient } from "pg";

/** A saved view as the store reads it. */
export interface SavedViewRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly ownerId: string | null;
  readonly entity: string;
  readonly name: string;
  readonly shared: boolean;
  readonly query: string;
}

export interface SavedViewPatch {
  readonly name?: string;
  readonly query?: string;
  readonly shared?: boolean;
}

/** Row operations inside one transaction, scoped by workspace. */
export interface SavedViewTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  /** Whether any view has this id, in any workspace: ids are never reused. */
  exists(id: string): Promise<boolean>;
  get(workspaceId: string, id: string): Promise<SavedViewRow | null>;
  insert(row: SavedViewRow): Promise<void>;
  update(workspaceId: string, id: string, patch: SavedViewPatch): Promise<void>;
  remove(workspaceId: string, id: string): Promise<void>;
}

export interface SavedViewStore {
  transact<A>(fn: (tx: SavedViewTx) => Promise<A>): Promise<{ result: A; txid: number }>;
}

interface Row {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  entity: string;
  name: string;
  shared: boolean;
  query: string;
}

function viewTx(client: PoolClient): SavedViewTx {
  return {
    isMember: async (workspaceId, userId) =>
      (
        await client.query('SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = $2', [
          workspaceId,
          userId,
        ])
      ).rowCount === 1,
    exists: async (id) =>
      (await client.query("SELECT 1 FROM saved_view WHERE id = $1", [id])).rowCount === 1,
    get: async (workspaceId, id) => {
      const { rows } = await client.query<Row>(
        "SELECT id, workspace_id, owner_id, entity, name, shared, query FROM saved_view WHERE workspace_id = $1 AND id = $2",
        [workspaceId, id],
      );

      const row = rows[0];

      return row
        ? {
            id: row.id,
            workspaceId: row.workspace_id,
            ownerId: row.owner_id,
            entity: row.entity,
            name: row.name,
            shared: row.shared,
            query: row.query,
          }
        : null;
    },
    insert: async (row) => {
      await client.query(
        `INSERT INTO saved_view (id, workspace_id, owner_id, entity, name, shared, query)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.workspaceId, row.ownerId, row.entity, row.name, row.shared, row.query],
      );
    },
    update: async (workspaceId, id, patch) => {
      // Always stamps `updated_at`, so even an empty patch reaches the shape with its txid.
      await client.query(
        `UPDATE saved_view SET
           name = COALESCE($3, name),
           query = COALESCE($4, query),
           shared = COALESCE($5, shared),
           updated_at = now()
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, id, patch.name ?? null, patch.query ?? null, patch.shared ?? null],
      );
    },
    remove: async (workspaceId, id) => {
      await client.query("DELETE FROM saved_view WHERE workspace_id = $1 AND id = $2", [
        workspaceId,
        id,
      ]);
    },
  };
}

/** The Postgres store on the shared pool; each transaction reads `pg_current_xact_id()`. */
export function pgSavedViewStore(pool: Pool): SavedViewStore {
  return {
    transact: async (fn) => {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const result = await fn(viewTx(client));

        const { rows } = await client.query<{ txid: string }>(
          "SELECT pg_current_xact_id()::xid::text AS txid",
        );

        await client.query("COMMIT");

        const txid = Number(rows[0]?.txid);

        if (!Number.isSafeInteger(txid)) throw new Error("Unexpected transaction id");

        return { result, txid };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);

        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** In-memory store for tests: members are `workspaceId:userId` pairs; a throw changes nothing. */
export function createMemorySavedViewStore(members: Iterable<string>) {
  const memberships = new Set(members);
  let views = new Map<string, SavedViewRow>();
  let txid = 3000;

  const store: SavedViewStore = {
    transact: async (fn) => {
      const draft = new Map(views);

      const inWorkspace = (workspaceId: string, id: string) => {
        const row = draft.get(id);

        return row?.workspaceId === workspaceId ? row : null;
      };

      const result = await fn({
        isMember: async (workspaceId, userId) => memberships.has(`${workspaceId}:${userId}`),
        exists: async (id) => draft.has(id),
        get: async (workspaceId, id) => inWorkspace(workspaceId, id),
        insert: async (row) => {
          draft.set(row.id, row);
        },
        update: async (workspaceId, id, patch) => {
          const row = inWorkspace(workspaceId, id);

          if (row) draft.set(id, { ...row, ...patch });
        },
        remove: async (workspaceId, id) => {
          if (inWorkspace(workspaceId, id)) draft.delete(id);
        },
      });

      views = draft;
      txid += 1;

      return { result, txid };
    },
  };

  return { store, views: () => views };
}
