import { createFileRoute } from "@tanstack/react-router";
import { catalogQuery, connectionLogosQuery, connectionsQuery } from "../../../lib/connections.ts";
import { skillsQuery } from "../../../lib/skills.ts";

/** What an app's sign-in returned with. Set only by the API's OAuth callback redirect. */
interface ConnectionsSearch {
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

/** Connected apps. The page is in connections.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/connections")({
  // Parsed by hand (no schema library in the cold-entry bundle for three params).
  validateSearch: (search: ConnectionsSearchInput): ConnectionsSearch => {
    const result: ConnectionsSearch = {};
    const connected = text(search.connected);
    const error = text(search.error);
    const app = text(search.app);

    if (connected) result.connected = connected;

    if (error) result.error = error;

    if (app) result.app = app;

    return result;
  },
  loader: ({ context: { queryClient, session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";

    // Logos may need a first fetch from context.dev: start it, but don't wait for it.
    void queryClient.prefetchQuery(connectionLogosQuery(session.user.id, workspaceId));

    return Promise.all([
      queryClient.fetchQuery(connectionsQuery(session.user.id, workspaceId)),
      queryClient.fetchQuery(catalogQuery(session.user.id, workspaceId)),
      queryClient.fetchQuery(skillsQuery(session.user.id, workspaceId)),
    ]);
  },
});
