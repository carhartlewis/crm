import { createFileRoute } from "@tanstack/react-router";
import { chatHistoryQuery } from "../../../../lib/chat-api.ts";

/**
 * One chat. The loader reads its saved events (Redis on the server), so hovering the chat in the
 * sidebar has them ready before the click. A chat opened before renders from the cached copy at
 * once: the page follows the live stream from that copy's cursor, so it is always safe to show.
 * The page is in $chatId.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/chats/$chatId")({
  loader: async ({ context: { queryClient, session }, params }) => {
    const workspaceId = session.session.activeOrganizationId;

    // The syncs start alongside; the page doesn't wait for them.
    if (workspaceId) {
      void import("../../../../lib/chats.ts").then(({ preloadChats }) => preloadChats(workspaceId));
    }

    return queryClient.ensureQueryData(chatHistoryQuery(session.user.id, params.chatId));
  },
});
