import { createFileRoute } from "@tanstack/react-router";
import { chatHistoryQuery } from "../../../../lib/chat-api.ts";

/**
 * One chat. The loader fetches its saved events (Redis first on the server), so hovering the
 * chat in the sidebar has them ready before the click. The page is in $chatId.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/chats/$chatId")({
  loader: async ({ context: { queryClient, session }, params }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (workspaceId) {
      const { preloadChats } = await import("../../../../lib/chats.ts");

      preloadChats(workspaceId);
    }

    return queryClient.fetchQuery(chatHistoryQuery(session.user.id, params.chatId));
  },
});
