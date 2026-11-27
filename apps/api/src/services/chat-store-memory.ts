import type { ChatRow, ChatStore, ChatTx, SpaceRow } from "./Chats.ts";

export interface MemorySidebar {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly pinned: readonly string[];
  readonly folders: readonly unknown[];
  readonly recent: readonly string[];
}

interface Rows {
  chats: Map<string, ChatRow & { lastMessageAt: number }>;
  spaces: Map<string, SpaceRow>;
  sidebars: Map<string, MemorySidebar>;
  /** `spaceId:userId` of each joined space. */
  members: Set<string>;
}

const copy = (rows: Rows): Rows => ({
  chats: new Map(rows.chats),
  spaces: new Map(rows.spaces),
  sidebars: new Map(rows.sidebars),
  members: new Set(rows.members),
});

/**
 * In-memory `ChatStore` for tests. Members are `workspaceId:userId:role` triples; txids count up;
 * a transaction that throws leaves the rows unchanged. Deleting a space makes its chats private,
 * as `ON DELETE SET NULL` does.
 */
export function createMemoryChatStore(members: Iterable<string>, now = () => Date.now()) {
  const roles = new Map<string, string>();

  for (const member of members) {
    const [workspaceId, userId, role = "member"] = member.split(":");

    roles.set(`${workspaceId}:${userId}`, role);
  }

  let rows: Rows = { chats: new Map(), spaces: new Map(), sidebars: new Map(), members: new Set() };
  let txid = 1000;

  const role = async (workspaceId: string, userId: string) =>
    roles.get(`${workspaceId}:${userId}`) ?? null;

  const store: ChatStore = {
    role,
    chat: async (id) => rows.chats.get(id) ?? null,
    isSpaceMember: async (spaceId, userId) => rows.members.has(`${spaceId}:${userId}`),
    chatBySession: async (sessionId) =>
      [...rows.chats.values()].find((chat) => chat.sessionId === sessionId) ?? null,
    setAutoTitle: async (id, title) => {
      const chat = rows.chats.get(id);

      if (!chat || chat.autoTitle === false) return false;

      rows.chats.set(id, { ...chat, title, autoTitle: false });

      return true;
    },
    touch: async (id) => {
      const chat = rows.chats.get(id);

      if (chat) rows.chats.set(id, { ...chat, lastMessageAt: now() });
    },
    transact: async (fn) => {
      const draft = copy(rows);

      const tx: ChatTx = {
        role,
        chat: async (id) => draft.chats.get(id) ?? null,
        insertChat: async (row) => {
          draft.chats.set(row.id, { ...row, lastMessageAt: now() });
        },
        updateChat: async (id, patch) => {
          const chat = draft.chats.get(id);

          if (chat) draft.chats.set(id, { ...chat, ...patch });
        },
        deleteChat: async (id) => {
          draft.chats.delete(id);
        },
        space: async (id) => draft.spaces.get(id) ?? null,
        insertSpace: async (row) => {
          draft.spaces.set(row.id, row);
        },
        updateSpace: async (id, patch) => {
          const space = draft.spaces.get(id);

          if (space) draft.spaces.set(id, { ...space, ...patch });
        },
        isSpaceMember: async (spaceId, userId) => draft.members.has(`${spaceId}:${userId}`),
        joinSpace: async ({ spaceId, userId }) => {
          draft.members.add(`${spaceId}:${userId}`);
        },
        leaveSpace: async (spaceId, userId) => draft.members.delete(`${spaceId}:${userId}`),
        deleteSpace: async (id) => {
          draft.spaces.delete(id);

          for (const member of draft.members) {
            if (member.startsWith(`${id}:`)) draft.members.delete(member);
          }

          for (const [chatId, chat] of draft.chats) {
            if (chat.spaceId === id) draft.chats.set(chatId, { ...chat, spaceId: null });
          }
        },
        sidebarId: async (workspaceId, userId) =>
          [...draft.sidebars.values()].find(
            (row) => row.workspaceId === workspaceId && row.userId === userId,
          )?.id ?? null,
        saveSidebar: async ({ id, workspaceId, userId, layout, saveRecent }) => {
          const recent = saveRecent ? layout.recent : (draft.sidebars.get(id)?.recent ?? []);

          draft.sidebars.set(id, { id, workspaceId, userId, ...layout, recent });
        },
      };

      const result = await fn(tx);

      rows = draft;
      txid += 1;

      return { result, txid };
    },
  };

  return { store, rows: () => rows };
}
