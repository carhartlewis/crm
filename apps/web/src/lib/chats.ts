import {
  CHAT_SPACE_MEMBERS_SYNC_PATH,
  CHAT_SPACES_SYNC_PATH,
  CHATS_SYNC_PATH,
  SIDEBAR_SYNC_PATH,
} from "@crm/core/api";
import {
  decodeStoredLayout,
  type Json,
  type PermissionMode,
  type SidebarLayout,
  type SpaceColor,
  titleFromMessage,
} from "@crm/core/chat";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { mutationOptions } from "@tanstack/react-query";
import { createCollection } from "@tanstack/react-db";
import { request } from "./api-fetch.ts";
import type { Attachment } from "./attachments.ts";
import { prewarmUsed } from "./chat-api.ts";
import {
  checkedTxid,
  isoTimestamp,
  perWorkspace,
  syncedWrite,
  type WriteBody,
} from "./sync-collections.ts";

/**
 * Chats, spaces and the user's sidebar row, synced like CRM records (ADR 0012, ADR 0018). Loaded
 * with the chat nav and chat pages, never in cold entry.
 */

/** A chat row as Electric syncs it, without `session_id` (the API keeps it). */
export type Chat = {
  readonly id: string;
  readonly workspace_id: string;
  readonly space_id: string | null;
  readonly created_by_id: string | null;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_message_at: string;
  /** `manual`, `auto` or `bypass` (ADR 0019). */
  readonly permission_mode: string;
  /**
   * The record the chat is about, from a record sheet's Agent tab (ADR 0024). Absent in device
   * snapshots saved before records had chats.
   */
  readonly record_kind?: string | null;
  readonly record_id?: string | null;
};

export type ChatSpace = {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly created_by_id: string | null;
  readonly created_at: string;
};

/** Someone who joined a space (ADR 0020). */
export type ChatSpaceMember = {
  readonly space_id: string;
  readonly user_id: string;
  readonly workspace_id: string;
  readonly joined_at: string;
};

export type SidebarRow = {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly pinned: Json;
  readonly folders: Json;
  /** Chat ids in the order Recents was dragged into; null until it is. */
  readonly recent_order: Json;
  readonly updated_at: string;
};

/** Where a collection syncs from: the API proxy, with the workspace in the URL (ADR 0012). */
const syncedFrom = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

/** Calls a write endpoint and waits for its txid in the collection's stream. */
async function writeAndAwait(
  awaitTxId: (txid: number) => Promise<boolean>,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: WriteBody,
) {
  await awaitTxId((await syncedWrite(path, method, body)).txid);
}

/** Session ids of chats being created, handed from `onInsert` to the create mutation. */
const pendingSessions = new Map<string, PromiseWithResolvers<string>>();

function createChatsCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<Chat>({
      id: `chats:${workspaceId}`,
      getKey: (chat) => chat.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(CHATS_SYNC_PATH, workspaceId),
      onInsert: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(async ({ modified }) => {
            const pending = pendingSessions.get(modified.id);

            try {
              const created = await request<{ txid: number; sessionId: string }>("/api/chats", {
                method: "POST",
                body: JSON.stringify({
                  id: modified.id,
                  title: modified.title,
                  spaceId: modified.space_id,
                  permissionMode: modified.permission_mode,
                  recordKind: modified.record_kind ?? null,
                  recordId: modified.record_id ?? null,
                }),
              });

              pending?.resolve(created.sessionId);
              await collection.utils.awaitTxId(checkedTxid(created.txid));
            } catch (error) {
              pending?.reject(error);
              throw error;
            } finally {
              pendingSessions.delete(modified.id);
            }
          }),
        );
      },
      onUpdate: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            writeAndAwait(
              collection.utils.awaitTxId,
              `/api/chats/${encodeURIComponent(original.id)}`,
              "PATCH",
              {
                title: changes.title,
                spaceId: changes.space_id,
                permissionMode: changes.permission_mode,
              },
            ),
          ),
        );
      },
      onDelete: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ original }) =>
            writeAndAwait(
              collection.utils.awaitTxId,
              `/api/chats/${encodeURIComponent(original.id)}`,
              "DELETE",
            ),
          ),
        );
      },
    }),
  );
}

function createSpacesCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<ChatSpace>({
      id: `chat-spaces:${workspaceId}`,
      getKey: (space) => space.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(CHAT_SPACES_SYNC_PATH, workspaceId),
      onInsert: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ modified }) =>
            writeAndAwait(collection.utils.awaitTxId, "/api/chat-spaces", "POST", {
              id: modified.id,
              name: modified.name,
              color: modified.color,
              description: modified.description,
            }),
          ),
        );
      },
      onUpdate: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            writeAndAwait(
              collection.utils.awaitTxId,
              `/api/chat-spaces/${encodeURIComponent(original.id)}`,
              "PATCH",
              { name: changes.name, color: changes.color, description: changes.description },
            ),
          ),
        );
      },
      onDelete: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ original }) =>
            writeAndAwait(
              collection.utils.awaitTxId,
              `/api/chat-spaces/${encodeURIComponent(original.id)}`,
              "DELETE",
            ),
          ),
        );
      },
    }),
  );
}

const membersPath = (spaceId: string) => `/api/chat-spaces/${encodeURIComponent(spaceId)}/members`;

function createSpaceMembersCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<ChatSpaceMember>({
      id: `chat-space-members:${workspaceId}`,
      getKey: (member) => `${member.space_id}:${member.user_id}`,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(CHAT_SPACE_MEMBERS_SYNC_PATH, workspaceId),
      // Joining and leaving are the caller's own rows: insert joins, delete leaves.
      onInsert: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ modified }) =>
            writeAndAwait(collection.utils.awaitTxId, membersPath(modified.space_id), "POST"),
          ),
        );
      },
      onDelete: async ({ transaction, collection }) => {
        await Promise.all(
          transaction.mutations.map(({ original }) =>
            writeAndAwait(collection.utils.awaitTxId, membersPath(original.space_id), "DELETE"),
          ),
        );
      },
    }),
  );
}

/** Saves the whole row: the API upserts it, so insert and update send the same request. */
async function saveRow(row: SidebarRow) {
  const layout = decodeStoredLayout(row);

  const response = await request<{ txid: number }>("/api/sidebar", {
    method: "PUT",
    body: JSON.stringify({
      id: row.id,
      pinned: layout.pinned,
      folders: layout.folders,
      recentOrder: layout.recent,
    }),
  });

  return checkedTxid(response.txid);
}

function createSidebarCollection(workspaceId: string) {
  return createCollection(
    electricCollectionOptions<SidebarRow>({
      id: `sidebar:${workspaceId}`,
      getKey: (row) => row.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncedFrom(SIDEBAR_SYNC_PATH, workspaceId),
      onInsert: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ modified }) => saveRow(modified)),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
      onUpdate: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ modified }) => saveRow(modified)),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
    }),
  );
}

export const chatsCollection = perWorkspace(createChatsCollection);

export const chatSpacesCollection = perWorkspace(createSpacesCollection);

export const sidebarCollection = perWorkspace(createSidebarCollection);

export const chatSpaceMembersCollection = perWorkspace(createSpaceMembersCollection);

export type ChatsCollection = ReturnType<typeof createChatsCollection>;

export type ChatSpacesCollection = ReturnType<typeof createSpacesCollection>;

export type SidebarCollection = ReturnType<typeof createSidebarCollection>;

/** Spaces oldest first, so a new space joins the end of the list. */
export function oldestFirst(spaces: readonly ChatSpace[] | undefined) {
  return (spaces ?? []).toSorted((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Starts all three syncs; route loaders call it so the sidebar and pages read local data. */
export function preloadChats(workspaceId: string) {
  void chatsCollection(workspaceId).preload();
  void chatSpacesCollection(workspaceId).preload();
  void sidebarCollection(workspaceId).preload();
  void chatSpaceMembersCollection(workspaceId).preload();
}

interface StartChat {
  readonly workspaceId: string;
  readonly userId: string;
  readonly text: string;
  readonly spaceId: string | null;
  readonly permissionMode: PermissionMode;
  /** The chat's title when it isn't the start of `text` (a branch). */
  readonly title?: string;
  /** Files sent with the first message; the chat page uploads and sends them. */
  readonly files?: readonly Attachment[];
  /** The record the chat is about, from a record sheet's Agent tab (ADR 0024). */
  readonly record?: { readonly kind: string; readonly id: string };
}

/**
 * Starts a chat from its first message. The row shows in the sidebar at once (optimistic); the
 * mutation resolves as soon as the API answers with the eve session, without waiting for sync,
 * so the chat page opens and sends the message right away. A refusal rolls the row back.
 */
export const startChatMutation = mutationOptions({
  mutationKey: ["chats", "start"],
  mutationFn: async ({
    workspaceId,
    userId,
    text,
    spaceId,
    permissionMode,
    title,
    record,
  }: StartChat) => {
    const id = createId(ID_PREFIXES.chat);
    const now = new Date().toISOString();
    const session = Promise.withResolvers<string>();

    pendingSessions.set(id, session);

    const transaction = chatsCollection(workspaceId).insert({
      id,
      workspace_id: workspaceId,
      space_id: spaceId,
      created_by_id: userId,
      title: title ?? titleFromMessage(text),
      created_at: now,
      updated_at: now,
      last_message_at: now,
      permission_mode: permissionMode,
      record_kind: record?.kind ?? null,
      record_id: record?.id ?? null,
    });

    // The row settles later, through sync; its failure already rejected `session`.
    void transaction.when("settled").catch(() => undefined);

    const sessionId = await session.promise;

    prewarmUsed();

    return { id, sessionId };
  },
});

interface UpdateChat {
  readonly workspaceId: string;
  readonly id: string;
  readonly title?: string;
  readonly spaceId?: string | null;
  readonly permissionMode?: PermissionMode;
}

/** Renames a chat or moves it to another space (null: Private). */
export const updateChatMutation = mutationOptions({
  mutationKey: ["chats", "update"],
  mutationFn: async ({ workspaceId, id, title, spaceId, permissionMode }: UpdateChat) => {
    const transaction = chatsCollection(workspaceId).update(id, (draft) => {
      if (title !== undefined) draft.title = title;

      if (spaceId !== undefined) draft.space_id = spaceId;

      if (permissionMode !== undefined) draft.permission_mode = permissionMode;
    });

    await transaction.when("settled");
  },
});

export const deleteChatMutation = mutationOptions({
  mutationKey: ["chats", "delete"],
  mutationFn: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
    await chatsCollection(workspaceId).delete(id).when("settled");
  },
});

interface SaveSpace {
  readonly workspaceId: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly color: SpaceColor;
}

export const createSpaceMutation = mutationOptions({
  mutationKey: ["chat-spaces", "create"],
  mutationFn: async ({ workspaceId, userId, name, description, color }: SaveSpace) => {
    const id = createId(ID_PREFIXES.chat_space);

    // The maker joins the space: the API adds that row in the same transaction, and it syncs.

    await chatSpacesCollection(workspaceId)
      .insert({
        id,
        workspace_id: workspaceId,
        name,
        description,
        color,
        created_by_id: userId,
        created_at: new Date().toISOString(),
      })
      .when("settled");

    return id;
  },
});

interface UpdateSpace {
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly color: SpaceColor;
}

export const updateSpaceMutation = mutationOptions({
  mutationKey: ["chat-spaces", "update"],
  mutationFn: async ({ workspaceId, id, name, description, color }: UpdateSpace) => {
    await chatSpacesCollection(workspaceId)
      .update(id, (draft) => {
        draft.name = name;
        draft.description = description;
        draft.color = color;
      })
      .when("settled");
  },
});

interface SpaceMembership {
  readonly workspaceId: string;
  readonly userId: string;
  readonly spaceId: string;
}

/** Joins a space: its chats join the caller's Recents at once. */
export const joinSpaceMutation = mutationOptions({
  mutationKey: ["chat-spaces", "join"],
  mutationFn: async ({ workspaceId, userId, spaceId }: SpaceMembership) => {
    await chatSpaceMembersCollection(workspaceId)
      .insert({
        space_id: spaceId,
        user_id: userId,
        workspace_id: workspaceId,
        joined_at: new Date().toISOString(),
      })
      .when("settled");
  },
});

export const leaveSpaceMutation = mutationOptions({
  mutationKey: ["chat-spaces", "leave"],
  mutationFn: async ({ workspaceId, userId, spaceId }: SpaceMembership) => {
    await chatSpaceMembersCollection(workspaceId).delete(`${spaceId}:${userId}`).when("settled");
  },
});

export const deleteSpaceMutation = mutationOptions({
  mutationKey: ["chat-spaces", "delete"],
  mutationFn: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
    await chatSpacesCollection(workspaceId).delete(id).when("settled");
  },
});

/**
 * Replaces the user's sidebar layout. The first save creates the row; the edit shows at once
 * and rolls back if the server refuses.
 */
export function saveLayout(
  collection: SidebarCollection,
  row: SidebarRow | undefined,
  context: { workspaceId: string; userId: string },
  layout: SidebarLayout,
) {
  const pinned = [...layout.pinned];

  const folders = layout.folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    chatIds: [...folder.chatIds],
  }));

  const recent = [...layout.recent];

  const transaction = row
    ? collection.update(row.id, (draft) => {
        draft.pinned = pinned;
        draft.folders = folders;
        draft.recent_order = recent;
      })
    : collection.insert({
        id: createId(ID_PREFIXES.sidebar),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        pinned,
        folders,
        recent_order: recent,
        updated_at: new Date().toISOString(),
      });

  return transaction.when("settled");
}
