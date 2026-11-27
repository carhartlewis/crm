import { createFileRoute } from "@tanstack/react-router";

/** What an app's sign-in returned with. Set only by the API's OAuth callback redirect. */
export interface ConnectionsSearch {
  connected?: string;
  error?: string;
  app?: string;
}

/** A search value after the router's JSON parsing. */
type SearchValue = string | number | boolean | null;

interface ConnectionsSearchInput {
  connected?: SearchValue;
  error?: SearchValue;
  app?: SearchValue;
}

/** A non-empty string, or undefined. */
function text(value: SearchValue | undefined) {
  const raw = value === undefined || value === null ? "" : String(value);

  return raw === "" ? undefined : raw;
}

// Parsed by hand (no schema library in the cold-entry bundle for three params).
export function validateConnectionsSearch(search: ConnectionsSearchInput): ConnectionsSearch {
  const result: ConnectionsSearch = {};
  const connected = text(search.connected);
  const error = text(search.error);
  const app = text(search.app);

  if (connected) result.connected = connected;

  if (error) result.error = error;

  if (app) result.app = app;

  return result;
}

/** Connected apps and custom connectors. The page is in connections.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/settings/connections")({
  validateSearch: validateConnectionsSearch,
  /**
   * Connections and custom connectors sync through Electric. The loader starts both syncs and
   * waits for their first snapshot, so the page renders with data (it opens an empty list on
   * Discover). Dynamic imports keep TanStack DB and Electric out of cold entry.
   */
  loader: async ({ context: { queryClient, session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";
    const connections = await import("../../../../lib/connections.ts");

    // Logos may need a first fetch from context.dev: start it, but don't wait for it.
    void queryClient.prefetchQuery(connections.connectionLogosQuery(session.user.id, workspaceId));

    await Promise.all([
      connections.connectionsCollection(workspaceId).preload(),
      connections.customConnectorsCollection(workspaceId).preload(),
    ]);
  },
});
