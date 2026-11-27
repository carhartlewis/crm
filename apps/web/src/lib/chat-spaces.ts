import { useLiveQuery } from "@tanstack/react-db";
import { type Chat, type ChatSpace, chatSpacesCollection, chatsCollection } from "./chats.ts";

/** The workspace's spaces, live, for ⌘K (subscribing starts the sync). */
export function useChatSpaces(workspaceId: string): readonly ChatSpace[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ space: chatSpacesCollection(workspaceId) }),
  });

  return data;
}

/**
 * The chats this person can see, live and newest first, for ⌘K: the ones they started and the
 * ones in spaces they joined. The synced shape already holds exactly these (ADR 0020).
 */
export function useVisibleChats(workspaceId: string): readonly Chat[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ chat: chatsCollection(workspaceId) }),
  });

  return data.toSorted((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
