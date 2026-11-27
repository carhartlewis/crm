import { createFileRoute } from "@tanstack/react-router";
import { prewarmChat } from "../../../lib/chat-api.ts";

/** New chat's search: the space the chat starts in. Absent means Private. */
export interface NewChatSearch {
  space?: string;
}

/** A search value after the router's JSON parsing. */
type SearchValue = string | number | boolean | null;

// Parsed by hand (no schema library in the cold-entry bundle for one param).
export function validateNewChatSearch(search: { space?: SearchValue }): NewChatSearch {
  const space = search.space === undefined || search.space === null ? "" : String(search.space);

  return space ? { space } : {};
}

/**
 * New chat (ADR 0018), the workspace's home. The loader asks for a prewarmed eve session and
 * starts the chat syncs through a dynamic import, so TanStack DB stays out of cold entry. The
 * page is in index.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/")({
  validateSearch: validateNewChatSearch,
  loader: async ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId;

    if (!workspaceId) return;

    prewarmChat();

    const { preloadChats } = await import("../../../lib/chats.ts");

    preloadChats(workspaceId);
  },
});
