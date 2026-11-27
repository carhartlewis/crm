import { createFileRoute } from "@tanstack/react-router";

/**
 * Every space of the workspace, to find, join and pin (ADR 0020). The list reads synced data, so
 * the loader only starts the syncs. The page is in index.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/spaces/")({
  loader: ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (!workspaceId) return;

    // Started, not awaited: the page reads synced data as it arrives.
    void import("../../../../lib/chats.ts").then(({ preloadChats }) => preloadChats(workspaceId));
  },
});
