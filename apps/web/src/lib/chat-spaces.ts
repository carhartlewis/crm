import { useLiveQuery } from "@tanstack/react-db";
import { type ChatSpace, chatSpacesCollection } from "./chats.ts";

/** The workspace's spaces, live, for ⌘K (subscribing starts the sync). */
export function useChatSpaces(workspaceId: string): readonly ChatSpace[] {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ space: chatSpacesCollection(workspaceId) }),
  });

  return data;
}
