import { createFileRoute } from "@tanstack/react-router";

/**
 * Every space of the workspace, to find, join and pin (ADR 0020). The list reads synced data, so
 * the loader only starts the syncs. The page is in index.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/spaces/")({
  loader: async ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (!workspaceId) return;

    const { preloadChats } = await import("../../../../lib/chats.ts");

    preloadChats(workspaceId);
  },
});
