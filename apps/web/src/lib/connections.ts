import type { CatalogEntry } from "@crm/core/api";
import { CONNECTIONS_SYNC_PATH, CUSTOM_CONNECTORS_SYNC_PATH } from "@crm/core/api";
import { type Access, customIntegration, integrations, type Integration } from "@crm/integrations";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { request } from "./api-fetch.ts";
import { isoTimestamp, perWorkspace, syncedWrite } from "./sync-collections.ts";

/**
 * Connections and custom connectors sync from Postgres through Electric (ADR 0012), so the page
 * reads them locally and a sign-in that finishes in another window shows up on its own. Logos
 * and the app's OAuth stay requests: they are third-party.
 */

/**
 * One of the caller's connections, as Electric syncs it. The API leaves out `credentials`. A
 * type alias, not an interface: TanStack DB rows need an implicit index signature.
 */
export type Connection = {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  /** Catalog id, such as "granola". */
  readonly integration: string;
  readonly access: Access;
  readonly created_at: string;
  readonly updated_at: string;
};

/** A remote MCP server the workspace added, as Electric syncs it. */
export type CustomConnector = {
  readonly id: string;
  readonly workspace_id: string;
  /** Slug of the name: the connector's catalog id and `connection.integration`. */
  readonly key: string;
  readonly name: string;
  readonly mcp_url: string;
  readonly added_by_id: string | null;
  readonly created_at: string;
};

/** Where a table syncs from. The API fixes rows and columns; the workspace keeps caches apart. */
const syncSource = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

const createConnections = (workspaceId: string) =>
  createCollection(
    electricCollectionOptions<Connection>({
      id: `connections:${workspaceId}`,
      getKey: (connection) => connection.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncSource(CONNECTIONS_SYNC_PATH, workspaceId),
      // Rows are created by the app's OAuth callback on the server, so there is no insert.
      // Changes are optimistic until their txid arrives in the stream; a rejection rolls back.
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            syncedWrite(`/api/connections/${encodeURIComponent(original.integration)}`, "PATCH", {
              access: changes.access ?? original.access,
            }),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onDelete: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original }) =>
            syncedWrite(`/api/connections/${encodeURIComponent(original.integration)}`, "DELETE"),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  );

const createCustomConnectors = (workspaceId: string) =>
  createCollection(
    electricCollectionOptions<CustomConnector>({
      id: `custom-connectors:${workspaceId}`,
      getKey: (connector) => connector.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncSource(CUSTOM_CONNECTORS_SYNC_PATH, workspaceId),
      // Adding one is not optimistic: the API first checks the server offers MCP OAuth (see
      // `addConnectorMutation`). Removing it also removes everyone's connection to it.
      onDelete: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original }) =>
            syncedWrite(`/api/connections/custom/${encodeURIComponent(original.key)}`, "DELETE"),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  );

export type ConnectionsCollection = ReturnType<typeof createConnections>;

export type CustomConnectorsCollection = ReturnType<typeof createCustomConnectors>;

/** The caller's synced connections in a workspace. */
export const connectionsCollection = perWorkspace(createConnections);

/** The workspace's synced custom connectors. */
export const customConnectorsCollection = perWorkspace(createCustomConnectors);

function toEntry(app: Integration, custom: boolean): CatalogEntry {
  const { id, name, vendor, domain, summary } = app;

  return { id, name, vendor, domain, summary, custom };
}

/** The apps this workspace can connect: the built-in catalog, then its custom connectors. */
export function catalogOf(custom: readonly CustomConnector[]): readonly CatalogEntry[] {
  return [
    ...integrations.map((app) => toEntry(app, false)),
    ...custom.map(({ key, name, mcp_url }) =>
      toEntry(customIntegration({ key, name, mcpUrl: mcp_url }), true),
    ),
  ];
}

/** Logos are per user and workspace in the key, so one account's cache never serves another. */
export const connectionKeys = {
  all: ["connections"] as const,
  list: (userId: string, workspaceId: string) =>
    [...connectionKeys.all, userId, workspaceId] as const,
};

/** Each app's logo URL in our storage, by app id. Logos change rarely: fresh for an hour. */
export const connectionLogosQuery = (userId: string, workspaceId: string) =>
  queryOptions({
    queryKey: [...connectionKeys.list(userId, workspaceId), "logos"] as const,
    queryFn: () => request<Readonly<Record<string, string | null>>>("/api/connections/logos"),
    staleTime: 60 * 60 * 1000,
  });

/**
 * Adds a custom connector for the workspace. Settles once the new connector has synced back, so
 * its card is there when the sheet closes. A logo for it is fetched on the next logos refresh.
 */
export const addConnectorMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "add-custom"],
  mutationFn: async (input: {
    collection: CustomConnectorsCollection;
    name: string;
    url: string;
  }) => {
    const { txid } = await syncedWrite("/api/connections/custom", "POST", {
      name: input.name,
      url: input.url,
    });

    await input.collection.utils.awaitTxId(txid);
  },
  onSettled: (_data, _error, _variables, _result, { client }) =>
    client.invalidateQueries({ queryKey: connectionKeys.all }),
});

/** Removes a custom connector for everyone: gone at once, back if the server refuses. */
export const removeConnectorMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "remove-custom"],
  mutationFn: async ({
    collection,
    id,
  }: {
    collection: CustomConnectorsCollection;
    id: string;
  }) => {
    await collection.delete(id).when("settled");
  },
});

/**
 * Starts the app's sign-in and leaves the page for it. The app returns to /connections. In the
 * desktop app the sign-in opens in the system browser; the new connection arrives through sync.
 * So success means "on its way", not "connected".
 */
export const connectMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "connect"],
  mutationFn: async ({ integration, access }: { integration: string; access: Access }) => {
    const { url } = await request<{ url: string }>(
      `/api/connections/${encodeURIComponent(integration)}/authorize`,
      { method: "POST", body: JSON.stringify({ access }) },
    );

    window.location.assign(url);
  },
});

/** Changes read/write access: shown at once, rolled back if the server refuses. */
export const setAccessMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "access"],
  mutationFn: async ({
    collection,
    id,
    access,
  }: {
    collection: ConnectionsCollection;
    id: string;
    access: Access;
  }) => {
    await collection
      .update(id, (draft) => {
        draft.access = access;
      })
      .when("settled");
  },
});

export const disconnectMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "disconnect"],
  mutationFn: async ({ collection, id }: { collection: ConnectionsCollection; id: string }) => {
    await collection.delete(id).when("settled");
  },
});

/** What the app's sign-in returned with (`?connected=` or `?error=` on /connections). */
export function outcomeMessage(search: { connected?: string; error?: string }, name: string) {
  if (search.connected) return { ok: true, text: `${name} is connected.` };

  switch (search.error) {
    case undefined:
      return null;
    case "denied":
      return { ok: false, text: `${name} was not connected: access was declined.` };
    case "expired":
      return { ok: false, text: "That sign-in expired. Connect again." };
    case "wrong_user":
      return { ok: false, text: "That sign-in was started by another account." };
    default:
      return { ok: false, text: `${name} could not be connected. Try again.` };
  }
}
