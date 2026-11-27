import { type Folder, type PinKey, pinKey, type SidebarLayout } from "@crm/core/chat";

/**
 * Pure edits to a user's sidebar layout (ADR 0018): the Pinned order and personal folders. The
 * chat nav applies one, then saves the whole row; the API runs the same rules again.
 */

/** Pins a chat or space at the end of Pinned, or unpins it. Pages are always pinned. */
export function togglePin(order: readonly PinKey[], key: PinKey): PinKey[] {
  return order.includes(key) ? order.filter((item) => item !== key) : [...order, key];
}

/** Pins `key` at `index` in the order (moving it there if it is already pinned). */
export function pinAt(order: readonly PinKey[], key: PinKey, index: number): PinKey[] {
  const at = order.slice(0, index).filter((item) => item === key).length;
  const without = order.filter((item) => item !== key);
  const place = Math.max(0, Math.min(index - at, without.length));

  return [...without.slice(0, place), key, ...without.slice(place)];
}

/** Puts a chat in a folder (taking it out of any other), or in none with `null`. */
export function moveToFolder(
  folders: readonly Folder[],
  chatId: string,
  folderId: string | null,
): Folder[] {
  return folders.map((folder) => {
    const without = folder.chatIds.filter((id) => id !== chatId);

    return {
      ...folder,
      chatIds: folder.id === folderId ? [chatId, ...without] : without,
    };
  });
}

export function addFolder(folders: readonly Folder[], folder: Folder): Folder[] {
  return [...folders, folder];
}

export function renameFolder(folders: readonly Folder[], id: string, name: string): Folder[] {
  return folders.map((folder) => (folder.id === id ? { ...folder, name } : folder));
}

/** Deletes a folder; its chats go back to Recents. */
export function removeFolder(folders: readonly Folder[], id: string): Folder[] {
  return folders.filter((folder) => folder.id !== id);
}

/** The folder a chat is in, if any. */
export function folderOf(folders: readonly Folder[], chatId: string) {
  return folders.find((folder) => folder.chatIds.includes(chatId));
}

/** Drops a deleted chat from Pinned and every folder. */
export function forgetChat(layout: SidebarLayout, chatId: string): SidebarLayout {
  const key = pinKey("chat", chatId);

  return {
    pinned: layout.pinned.filter((item) => item !== key),
    folders: moveToFolder(layout.folders, chatId, null),
    recent: layout.recent.filter((id) => id !== chatId),
  };
}

export interface RecentChat {
  readonly id: string;
  readonly space_id: string | null;
  readonly created_by_id: string | null;
  readonly last_message_at: string;
}

export const RECENTS_LIMIT = 20;

/**
 * Recents: the chats you started and the chats in spaces you joined (ADR 0020) that are neither
 * pinned nor in a folder. Chats placed by a drag keep their saved order; newer ones go above
 * them, newest message first.
 */
export function recentChats<C extends RecentChat>(
  chats: readonly C[],
  layout: SidebarLayout,
  userId: string,
  joinedSpaceIds: ReadonlySet<string> = new Set(),
): C[] {
  const placed = new Set([
    ...layout.folders.flatMap((folder) => folder.chatIds),
    ...layout.pinned.flatMap((key) => (key.startsWith("chat:") ? [key.slice(5)] : [])),
  ]);

  const order = new Map(layout.recent.map((id, index) => [id, index]));

  return chats
    .filter(
      (chat) =>
        (chat.created_by_id === userId ||
          (chat.space_id !== null && joinedSpaceIds.has(chat.space_id))) &&
        !placed.has(chat.id),
    )
    .toSorted((a, b) => {
      const placeA = order.get(a.id);
      const placeB = order.get(b.id);

      if (placeA !== undefined && placeB !== undefined) return placeA - placeB;

      if (placeA !== undefined || placeB !== undefined) return placeA === undefined ? -1 : 1;

      return b.last_message_at.localeCompare(a.last_message_at);
    })
    .slice(0, RECENTS_LIMIT);
}
