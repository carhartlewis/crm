import { DEAL_CONTACTS_SYNC_PATH, DEALS_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { REPORTING_CURRENCY } from "@crm/core/records";
import { mutationOptions } from "@tanstack/react-query";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { isoTimestamp, perWorkspace, syncedWrite } from "./sync-collections.ts";
import { archivedFlag, pickColumns, syncedRecords } from "./synced-records.ts";

/** A deal row exactly as Electric syncs it; `amount` is decimal text, dates `YYYY-MM-DD`. */
export type Deal = {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly company_id: string;
  readonly owner_id: string | null;
  readonly stage: string;
  readonly stage_changed_at: string;
  readonly amount: string | null;
  readonly currency: string;
  /** The amount in the reporting currency, stored by the API at `fx_rate` (ADR 0024). */
  readonly base_amount: string | null;
  readonly base_currency: string | null;
  readonly fx_rate: string | null;
  readonly fx_rate_at: string | null;
  readonly expected_close_date: string | null;
  readonly closed_at: string | null;
  readonly closed_reason: string | null;
  readonly last_activity_at: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

const EDITABLE = [
  "name",
  "amount",
  "currency",
  "expected_close_date",
  "company_id",
  "owner_id",
  "description",
  "stage",
  "closed_reason",
] as const;

export const dealsCollection = syncedRecords<Deal>({
  name: "deals",
  syncPath: DEALS_SYNC_PATH,
  writePath: "/api/deals",
  createBody: (row) => ({
    id: row.id,
    name: row.name,
    company_id: row.company_id,
    owner_id: row.owner_id,
    stage: row.stage,
    amount: row.amount,
    currency: row.currency,
    expected_close_date: row.expected_close_date,
  }),
  patchBody: (changes) => ({ ...pickColumns(changes, EDITABLE), ...archivedFlag(changes) }),
});

export type DealsCollection = ReturnType<typeof dealsCollection>;

export interface DealInput {
  readonly name: string;
  readonly company_id: string;
  readonly stage: string;
  readonly amount: string | null;
  readonly currency: string;
  readonly expected_close_date: string | null;
}

export function newDeal(workspaceId: string, ownerId: string | null, input: DealInput): Deal {
  const now = new Date().toISOString();

  return {
    id: createId(ID_PREFIXES.deal),
    workspace_id: workspaceId,
    ...input,
    currency: input.currency || REPORTING_CURRENCY,
    // The API converts the amount; until it does, totals count a deal in its own currency.
    base_amount: null,
    base_currency: null,
    fx_rate: null,
    fx_rate_at: null,
    description: null,
    owner_id: ownerId,
    stage_changed_at: now,
    closed_at: null,
    closed_reason: null,
    last_activity_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  };
}

export const createDealMutation = mutationOptions({
  mutationKey: ["deals", "create"],
  mutationFn: async (args: {
    collection: DealsCollection;
    workspaceId: string;
    ownerId: string;
    input: DealInput;
  }) => {
    const row = newDeal(args.workspaceId, args.ownerId, args.input);

    await args.collection.insert(row).when("settled");

    return row.id;
  },
});

/** Who is on a deal; keyed `<deal_id>:<contact_id>`. */
export type DealContact = {
  readonly deal_id: string;
  readonly contact_id: string;
  readonly workspace_id: string;
  readonly role: string | null;
  readonly created_at: string;
};

export const dealContactKey = (row: { deal_id: string; contact_id: string }) =>
  `${row.deal_id}:${row.contact_id}`;

const linkPath = (row: { deal_id: string; contact_id: string }) =>
  `/api/deals/${encodeURIComponent(row.deal_id)}/contacts/${encodeURIComponent(row.contact_id)}`;

/** The deal↔contact links of a workspace, synced and optimistic like the records. */
export const dealContactsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<DealContact>({
      id: `deal-contacts:${workspaceId}`,
      getKey: dealContactKey,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: {
        url: new URL(DEAL_CONTACTS_SYNC_PATH, window.location.origin).href,
        params: { workspace: workspaceId },
        parser: { timestamptz: isoTimestamp },
      },
      onInsert: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            syncedWrite(linkPath(modified), "PUT", { role: modified.role }),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            syncedWrite(linkPath(modified), "PUT", { role: modified.role }),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onDelete: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original }) => syncedWrite(linkPath(original), "DELETE")),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

export type DealContactsCollection = ReturnType<typeof dealContactsCollection>;
