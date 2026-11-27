import { MEMORY_FACTS_SYNC_PATH } from "@crm/core/api";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection, useLiveQuery } from "@tanstack/react-db";
import { isoTimestamp, perWorkspace } from "./sync-collections.ts";

/**
 * A copied memory fact as Electric syncs it (ADR 0017). Read-only: the API copies facts from
 * Supermemory; members change memory through `/api/memory/*`. A type alias, not an interface:
 * TanStack DB rows need an implicit index signature.
 */
export type MemoryFactRow = {
  readonly id: string;
  readonly workspace_id: string;
  /** Null for the workspace's own memory. */
  readonly company_id: string | null;
  readonly text: string;
  readonly is_static: boolean;
  readonly created_at: string;
};

function createMemoryFactsCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<MemoryFactRow>({
      id: `memory-facts:${workspaceId}`,
      getKey: (fact) => fact.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: {
        url: new URL(MEMORY_FACTS_SYNC_PATH, window.location.origin).href,
        params: { workspace: workspaceId },
        parser: { timestamptz: isoTimestamp },
      },
    }),
  );
}

/** The workspace's copied facts: its own and every company's. */
export const memoryFactsCollection = perWorkspace(createMemoryFactsCollection);

/** The workspace's copied facts, live (subscribing starts the sync). */
export function useMemoryFacts(workspaceId: string): readonly MemoryFactRow[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ fact: memoryFactsCollection(workspaceId) }),
  });

  return data;
}
