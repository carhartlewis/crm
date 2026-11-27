import { createFileRoute } from "@tanstack/react-router";

/**
 * The chats of one space; `private` lists your private chats. The list reads the synced chats,
 * so the loader only starts their sync. The page is in $spaceId.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/spaces/$spaceId")({
  loader: async ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (!workspaceId) return;

    const { preloadChats } = await import("../../../../lib/chats.ts");

    preloadChats(workspaceId);
  },
});
