import { createFileRoute } from "@tanstack/react-router";
import { memoryGraphQuery } from "../../../../lib/memory.ts";
import { workspaceQuery } from "../../../../lib/session.ts";

/** The workspace's memory graph. The page is in memory.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/settings/memory")({
  loader: ({ context: { queryClient, session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";

    return Promise.all([
      queryClient.fetchQuery(memoryGraphQuery(session.user.id, workspaceId)),
      queryClient.fetchQuery(workspaceQuery(session.user.id, workspaceId)),
    ]);
  },
});
