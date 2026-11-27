import { CONTACT_BRIEFS_SYNC_PATH, CONTACT_FACTS_SYNC_PATH } from "@crm/core/api";
import type { Json } from "@crm/core/chat";
import type { FactDecision } from "@crm/core/records";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { isoTimestamp, perWorkspace, syncedWrite } from "./sync-collections.ts";

/**
 * What the agent learned about contacts (ADR 0024): its proposed facts and its briefs, synced per
 * workspace. Only the agent writes them (through `crm__` tools); members apply or dismiss facts.
 */

/** A fact the agent proposed, as Electric syncs it. */
export type ContactFact = {
  readonly id: string;
  readonly workspace_id: string;
  readonly contact_id: string;
  /** The contact column it is for, such as `title` or `linkedin_url`. */
  readonly field: string;
  readonly value: string;
  readonly score: number;
  /** `verified`, `probable` or `possible`. */
  readonly band: string;
  readonly evidence: Json;
  readonly source_url: string | null;
  /** `proposed`, `applied`, `dismissed` or `superseded`. */
  readonly status: string;
  readonly decided_by_id: string | null;
  readonly decided_at: string | null;
  readonly observed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

/** The agent's brief on a contact, as Electric syncs it. */
export type ContactBrief = {
  readonly contact_id: string;
  readonly workspace_id: string;
  readonly narrative: string;
  /** `BriefSections` from `@crm/core/records`; read it with `readBriefSections`. */
  readonly sections: Json;
  readonly source_url: string | null;
  readonly refreshed_at: string;
  readonly updated_at: string;
};

const syncedFrom = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

export const contactFactsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<ContactFact>({
      id: `contact-facts:${workspaceId}`,
      getKey: (fact) => fact.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(CONTACT_FACTS_SYNC_PATH, workspaceId),
      // A member's decision: the status changes at once and settles with the API's txid.
      onUpdate: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(async ({ original, changes }) => {
            const written = await syncedWrite(
              `/api/contact-facts/${encodeURIComponent(original.id)}`,
              "PATCH",
              { status: changes.status },
            );

            return written.txid;
          }),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

export const contactBriefsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<ContactBrief>({
      id: `contact-briefs:${workspaceId}`,
      getKey: (brief) => brief.contact_id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(CONTACT_BRIEFS_SYNC_PATH, workspaceId),
    }),
  ),
);

/** Marks a proposed fact applied or dismissed: shown at once, settled with the API's txid. */
export async function decideFact(workspaceId: string, id: string, status: FactDecision) {
  await contactFactsCollection(workspaceId)
    .update(id, (draft) => {
      draft.status = status;
    })
    .when("settled");
}
