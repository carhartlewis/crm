import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { isoTimestamp, perWorkspace, syncedWrite, type WriteBody } from "./sync-collections.ts";

/** Any synced CRM row: an id-keyed snake_case object, as Electric sends it. */
type Row = { readonly id: string };

export interface SyncedRecordsOptions<R extends Row> {
  /** Collection id prefix, such as `contacts`; the workspace id is appended. */
  readonly name: string;
  /** The API's Electric shape proxy (`CONTACTS_SYNC_PATH`). */
  readonly syncPath: string;
  /** The write endpoints' base: `POST <base>`, `PATCH <base>/<id>`, `DELETE <base>/<id>`. */
  readonly writePath: string;
  /** The create body for an optimistic row. */
  readonly createBody: (row: R) => WriteBody;
  /**
   * The PATCH body for a row's changes. Unchanged fields are undefined, and JSON leaves them out:
   * a true patch.
   */
  readonly patchBody: (changes: Partial<R>) => WriteBody;
}

/** Calls a write endpoint and returns the Postgres txid to await in the Electric stream. */
const write = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: WriteBody) =>
  (await syncedWrite(path, method, body)).txid;

/**
 * One Electric-synced, optimistic collection of CRM records per workspace (ADR 0012). The API
 * proxies Electric: it checks the session and limits rows to the workspace, which is also in the
 * URL so each workspace's shape is cached apart. A change shows at once and stays until its txid
 * arrives in the stream; a rejected write rolls back.
 */
export function syncedRecords<R extends Row>(options: SyncedRecordsOptions<R>) {
  const path = (id: string) => `${options.writePath}/${encodeURIComponent(id)}`;

  return perWorkspace((workspaceId: string) =>
    createCollection(
      electricCollectionOptions<R>({
        id: `${options.name}:${workspaceId}`,
        getKey: (row) => row.id,
        // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
        shapeOptions: {
          url: new URL(options.syncPath, window.location.origin).href,
          params: { workspace: workspaceId },
          parser: { timestamptz: isoTimestamp },
        },
        onInsert: async ({ transaction, collection }) => {
          const txids = await Promise.all(
            transaction.mutations.map(({ modified }) =>
              write(options.writePath, "POST", options.createBody(modified)),
            ),
          );

          await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
        },
        onUpdate: async ({ transaction, collection }) => {
          const txids = await Promise.all(
            transaction.mutations.map(({ original, changes }) =>
              write(path(original.id), "PATCH", options.patchBody(changes)),
            ),
          );

          await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
        },
        onDelete: async ({ transaction, collection }) => {
          const txids = await Promise.all(
            transaction.mutations.map(({ original }) => write(path(original.id), "DELETE")),
          );

          await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
        },
      }),
    ),
  );
}

/** Picks the listed columns from a change set, so a PATCH never sends read-only columns. */
export function pickColumns<R extends object>(
  changes: Partial<R>,
  columns: readonly (keyof R & string)[],
) {
  const body: Record<string, string | boolean | null | undefined> = {};

  for (const column of columns) {
    const value = changes[column];

    if (value === undefined) continue;

    if (value === null) body[column] = null;
    else if (value === true || value === false) body[column] = value === true;
    else body[column] = String(value);
  }

  return body;
}

/** `archived_at` set or cleared becomes the API's `archived` flag. */
export function archivedFlag(changes: { readonly archived_at?: string | null }) {
  return changes.archived_at === undefined ? {} : { archived: changes.archived_at !== null };
}

/** The part of a TanStack DB collection a field save needs. */
interface Updatable<R> {
  update(id: string, apply: (draft: R) => void): { when(state: "settled"): Promise<object> };
  delete(ids: string[]): { when(state: "settled"): Promise<object> };
}

/**
 * Saves some of a record's columns: the change shows at once, and the promise settles once the
 * server stored it and the row came back through sync. A rejection rolls back and throws.
 */
export async function saveRecord<R extends object>(
  collection: Updatable<R>,
  id: string,
  patch: Partial<R>,
) {
  const transaction = collection.update(id, (draft) => {
    Object.assign(draft, patch);
  });

  await transaction.when("settled");
}

/** Deletes records at once; they come back if the server refuses. */
export async function deleteRecords<R>(collection: Updatable<R>, ids: readonly string[]) {
  await collection.delete([...ids]).when("settled");

  return ids.length;
}
