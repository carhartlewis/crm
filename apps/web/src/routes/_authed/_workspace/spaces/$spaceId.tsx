import { createFileRoute } from "@tanstack/react-router";

/**
 * The chats of one space; `private` lists your private chats. The list reads the synced chats,
 * so the loader only starts their sync. The page is in $spaceId.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/spaces/$spaceId")({
  loader: ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (!workspaceId) return;

    // Started, not awaited: the page reads synced data as it arrives.
    void import("../../../../lib/chats.ts").then(({ preloadChats }) => preloadChats(workspaceId));
  },
});
