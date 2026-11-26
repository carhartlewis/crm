import { mutationOptions } from "@tanstack/react-query";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { registerSynced } from "./synced.ts";

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

/**
 * Postgres sends `timestamptz` as text ("2026-11-26 23:53:53.944+00"), which `Date` doesn't parse
 * everywhere. Rows keep ISO strings, the same as optimistic rows.
 */
export function isoTimestamp(value: string) {
  const parsed = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));

  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** The body of a company write: what the API contract accepts (all fields, or a patch). */
interface CompanyWrite {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly domain?: string | null | undefined;
}

/** Calls a write endpoint and returns the Postgres txid to await in the Electric stream. */
async function write(path: string, method: "POST" | "PATCH" | "DELETE", body?: CompanyWrite) {
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

  const result: { txid?: unknown } = await response.json();

  if (!Number.isSafeInteger(result.txid)) throw new Error("The server returned no transaction id");

  return Number(result.txid);
}

function createCompaniesCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<Company>({
      id: `companies:${workspaceId}`,
      getKey: (company) => company.id,
      // The API proxies Electric: it checks the session and limits rows to this workspace. The
      // workspace is in the URL so each workspace's shape is cached separately.
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: {
        url: new URL("/api/shapes/companies", window.location.origin).href,
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

const collections = new Map<string, CompaniesCollection>();

/** The synced companies of a workspace: one collection per workspace, created on first use. */
export function companiesCollection(workspaceId: string): CompaniesCollection {
  let collection = collections.get(workspaceId);

  if (!collection) {
    collection = createCompaniesCollection(workspaceId);
    collections.set(workspaceId, collection);
  }

  return collection;
}

/** Stops syncing every workspace but `keep` (after a switch), or all of them (sign-out). */
async function releaseCompanies(keep?: string) {
  const released = [...collections].filter(([workspaceId]) => workspaceId !== keep);

  for (const [workspaceId] of released) collections.delete(workspaceId);

  await Promise.all(released.map(([, collection]) => collection.cleanup()));
}

registerSynced(releaseCompanies);

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
    const id = crypto.randomUUID();

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
