import { decodeStoredLayout, type Folder, type PinKey, type SidebarLayout } from "@crm/core/chat";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { toast } from "sonner";
import { readChatSnapshot, writeChatSnapshot } from "../../lib/chat-snapshot.ts";
import {
  type Chat,
  chatSpacesCollection,
  chatsCollection,
  oldestFirst,
  saveLayout,
  type SidebarRow,
  sidebarCollection,
} from "../../lib/chats.ts";
import {
  hasStoredOrder,
  moveItem,
  normalizeOrder,
  readPinnedOrder,
  usePinnedOrder,
  writePinnedOrder,
} from "../../lib/pinned-order.ts";
import {
  addFolder,
  forgetChat,
  moveToFolder,
  removeFolder,
  renameFolder,
  togglePin,
} from "../../lib/sidebar-layout.ts";

/** The layout a row holds, with every page still pinned (pages can't be unpinned). */
function layoutOf(row: SidebarRow | undefined, fallback: readonly PinKey[]): SidebarLayout {
  if (!row) return { pinned: fallback, folders: [] };

  const stored = decodeStoredLayout(row);

  return { pinned: normalizeOrder(stored.pinned), folders: stored.folders };
}

/**
 * Moves a pinned item, reading the current row and order at the moment of the drop: the drag
 * handler stays the same function across renders.
 */
export function reorderPinnedAt(workspaceId: string, userId: string, from: number, to: number) {
  const collection = sidebarCollection(workspaceId);
  const row = [...collection.values()][0];
  const layout = layoutOf(row, readPinnedOrder(userId));
  const next = { ...layout, pinned: moveItem(layout.pinned, from, to) };

  writePinnedOrder(userId, next.pinned);
  saveLayout(collection, row, { workspaceId, userId }, next).catch((error: Error) => {
    writePinnedOrder(userId, layout.pinned);
    toast.error(error.message);
  });
}

/**
 * The synced chats, spaces and sidebar row of one workspace, plus the edits the sidebar makes
 * (ADR 0018). Every edit shows at once and saves the whole row.
 */
export function useChats(workspaceId: string, userId: string) {
  // Read once per mount: callers remount (`key`) for another workspace.
  const chats = useLiveQuery(() => chatsCollection(workspaceId));
  const spaces = useLiveQuery(() => chatSpacesCollection(workspaceId));
  const rows = useLiveQuery(() => sidebarCollection(workspaceId));
  // Until each sync is ready, draw the device's last copy: the sidebar shows in the first frame.
  const [snapshot] = useState(() => readChatSnapshot(userId, workspaceId));
  const chatRows = chats.isReady ? (chats.data ?? []) : snapshot.chats;
  const spaceRows = oldestFirst(spaces.isReady ? spaces.data : snapshot.spaces);

  // The device's copy of the order: ⌥1–⌥9 and the shell read it before this chunk loads.
  const stored = usePinnedOrder(userId);
  const row = rows.data?.[0];

  const layout =
    rows.isReady || row ? layoutOf(row, stored) : { pinned: stored, folders: snapshot.folders };

  // The synced row is the source: mirror its pinned order into the device's copy as it changes
  // (another device, another tab). The first load also copies an order saved on this device
  // before the row existed.
  useMountEffect(() => {
    const collection = sidebarCollection(workspaceId);

    const mirror = () => {
      const current = [...collection.values()][0];

      if (current) writePinnedOrder(userId, layoutOf(current, []).pinned);
      else if (collection.isReady() && hasStoredOrder(userId)) {
        void saveLayout(
          collection,
          undefined,
          { workspaceId, userId },
          { pinned: readPinnedOrder(userId), folders: [] },
        ).catch(() => undefined);
      }
    };

    // Keeps the device's copy current once all three syncs are ready.
    const save = () => {
      const all = [chatsCollection(workspaceId), chatSpacesCollection(workspaceId), collection];

      if (!all.every((item) => item.isReady())) return;

      const current = [...collection.values()][0];

      writeChatSnapshot(userId, workspaceId, {
        chats: [...chatsCollection(workspaceId).values()],
        spaces: [...chatSpacesCollection(workspaceId).values()],
        folders: current ? decodeStoredLayout(current).folders : [],
      });
    };

    const subscriptions = [
      collection.subscribeChanges(mirror, { includeInitialState: true }),
      collection.subscribeChanges(save, { includeInitialState: true }),
      chatsCollection(workspaceId).subscribeChanges(save, { includeInitialState: true }),
      chatSpacesCollection(workspaceId).subscribeChanges(save, { includeInitialState: true }),
    ];

    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  });

  const save = (next: SidebarLayout) => {
    writePinnedOrder(userId, next.pinned);
    saveLayout(sidebarCollection(workspaceId), row, { workspaceId, userId }, next).catch(
      (error: Error) => {
        writePinnedOrder(userId, layout.pinned);
        toast.error(error.message);
      },
    );
  };

  const byId = new Map<string, Chat>(chatRows.map((chat) => [chat.id, chat]));

  return {
    chats: chatRows,
    chatById: (id: string) => byId.get(id),
    spaces: spaceRows,
    layout,
    // Whether the synced data (not the device's copy) is in: empty states wait for it.
    isReady: chats.isReady && spaces.isReady && rows.isReady,
    togglePin: (key: PinKey) => save({ ...layout, pinned: togglePin(layout.pinned, key) }),
    moveToFolder: (chatId: string, folderId: string | null) =>
      save({ ...layout, folders: moveToFolder(layout.folders, chatId, folderId) }),
    /** Makes a folder, optionally with a chat in it, and returns its id. */
    addFolder: (name: string, chatId?: string) => {
      const folder: Folder = { id: createId(ID_PREFIXES.folder), name, chatIds: [] };
      const folders = addFolder(layout.folders, folder);

      save({ ...layout, folders: chatId ? moveToFolder(folders, chatId, folder.id) : folders });

      return folder.id;
    },
    renameFolder: (id: string, name: string) =>
      save({ ...layout, folders: renameFolder(layout.folders, id, name) }),
    removeFolder: (id: string) => save({ ...layout, folders: removeFolder(layout.folders, id) }),
    forgetChat: (chatId: string) => save(forgetChat(layout, chatId)),
  };
}

export type ChatsApi = ReturnType<typeof useChats>;
