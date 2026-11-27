import { registerSynced } from "./synced.ts";

/**
 * Shared plumbing for Electric-synced collections (ADR 0012). Imported only by collection
 * modules, which load with the pages that use them, never in cold entry.
 */

/**
 * Postgres sends `timestamptz` as text ("2026-11-26 23:53:53.944+00"), which `Date` doesn't parse
 * everywhere. Rows keep ISO strings, the same as optimistic rows.
 */
export function isoTimestamp(value: string) {
  const parsed = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));

  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** A JSON write body: the fields an endpoint in `@crm/core/api` accepts. */
export type WriteBody = Readonly<Record<string, string | boolean | null | undefined>>;

/** What every synced write answers: its txid, and the new row's id for creates. */
export interface SyncedWrite {
  readonly txid: number;
  readonly id: string | undefined;
}

/**
 * Calls a write endpoint. The caller awaits `txid` in the collection's stream, so the change
 * counts as saved only once the synced row shows it.
 */
export async function syncedWrite(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: WriteBody,
): Promise<SyncedWrite> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const failure: { message?: unknown } = await response.json().catch(() => ({}));

    throw new Error(
      String(failure.message) === failure.message
        ? failure.message
        : "The change couldn't be saved",
    );
  }

  const result: { txid?: unknown; id?: unknown } = await response.json();

  if (!Number.isSafeInteger(result.txid)) throw new Error("The server returned no transaction id");

  return {
    txid: Number(result.txid),
    id: String(result.id) === result.id ? result.id : undefined,
  };
}

/**
 * One collection per workspace, created on first use, so switching workspace never shows another
 * workspace's rows. Registers with `releaseSynced`: a switch stops the others, sign-out all.
 */
export function perWorkspace<C extends { cleanup(): Promise<void> }>(
  create: (workspaceId: string) => C,
) {
  const collections = new Map<string, C>();

  registerSynced(async (keep) => {
    const released = [...collections].filter(([workspaceId]) => workspaceId !== keep);

    for (const [workspaceId] of released) collections.delete(workspaceId);

    await Promise.all(released.map(([, collection]) => collection.cleanup()));
  });

  return (workspaceId: string): C => {
    let collection = collections.get(workspaceId);

    if (!collection) {
      collection = create(workspaceId);
      collections.set(workspaceId, collection);
    }

    return collection;
  };
}
