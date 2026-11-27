import { COMPANIES_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { mutationOptions } from "@tanstack/react-query";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { isoTimestamp, perWorkspace, syncedWrite, type WriteBody } from "./sync-collections.ts";

/**
 * A company row exactly as Electric syncs it (snake_case, timestamps as ISO strings). A type
 * alias, not an interface: TanStack DB rows need an implicit index signature.
 */
export type Company = {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly domain: string | null;
  readonly owner_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export interface CompanyInput {
  readonly name: string;
  readonly domain: string | null;
}

/** Calls a write endpoint and returns the Postgres txid to await in the Electric stream. */
const write = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: WriteBody) =>
  (await syncedWrite(path, method, body)).txid;

function createCompaniesCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<Company>({
      id: `companies:${workspaceId}`,
      getKey: (company) => company.id,
      // The API proxies Electric: it checks the session and limits rows to this workspace. The
      // workspace is in the URL so each workspace's shape is cached separately.
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: {
        url: new URL(COMPANIES_SYNC_PATH, window.location.origin).href,
        params: { workspace: workspaceId },
        parser: { timestamptz: isoTimestamp },
      },
      // Writes are optimistic: the change shows at once and stays until its txid arrives in the
      // stream; a rejected write rolls back.
      onInsert: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ modified }) =>
            write("/api/companies", "POST", {
              id: modified.id,
              name: modified.name,
              domain: modified.domain,
            }),
          ),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
      onUpdate: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            // Unchanged fields are undefined, and JSON leaves them out: a true patch.
            write(`/api/companies/${encodeURIComponent(original.id)}`, "PATCH", {
              name: changes.name,
              domain: changes.domain,
            }),
          ),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
      onDelete: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ original }) =>
            write(`/api/companies/${encodeURIComponent(original.id)}`, "DELETE"),
          ),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
    }),
  );
}

export type CompaniesCollection = ReturnType<typeof createCompaniesCollection>;

/** The synced companies of a workspace: one collection per workspace, created on first use. */
export const companiesCollection = perWorkspace(createCompaniesCollection);

interface CreateCompany {
  readonly collection: CompaniesCollection;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly input: CompanyInput;
}

/**
 * Adds a company: it appears in the list at once (optimistic) and the mutation settles when the
 * server has stored it and the row has come back through sync. A rejection rolls it back.
 */
export const createCompanyMutation = mutationOptions({
  mutationKey: ["companies", "create"],
  mutationFn: async ({ collection, workspaceId, ownerId, input }: CreateCompany) => {
    const now = new Date().toISOString();
    const id = createId(ID_PREFIXES.company);

    const transaction = collection.insert({
      id,
      workspace_id: workspaceId,
      name: input.name,
      domain: input.domain,
      owner_id: ownerId,
      created_at: now,
      updated_at: now,
    });

    await transaction.when("settled");

    return id;
  },
});

interface UpdateCompany {
  readonly collection: CompaniesCollection;
  readonly id: string;
  readonly input: CompanyInput;
}

export const updateCompanyMutation = mutationOptions({
  mutationKey: ["companies", "update"],
  mutationFn: async ({ collection, id, input }: UpdateCompany) => {
    const transaction = collection.update(id, (draft) => {
      draft.name = input.name;
      draft.domain = input.domain;
    });

    await transaction.when("settled");
  },
});

interface DeleteCompanies {
  readonly collection: CompaniesCollection;
  readonly ids: readonly string[];
}

/** Removes companies at once; they come back if the server refuses. */
export const deleteCompaniesMutation = mutationOptions({
  mutationKey: ["companies", "delete"],
  mutationFn: async ({ collection, ids }: DeleteCompanies) => {
    const transaction = collection.delete([...ids]);

    await transaction.when("settled");

    return ids.length;
  },
});
