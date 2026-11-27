import { FolderInput, parseSidebarLayout, type Folder } from "@crm/core/chat";
import { Option, Schema } from "effect";
import type { Chat, ChatSpace } from "./chats.ts";

/**
 * The sidebar's last synced chats, spaces and folders, on this device, so Spaces, Folders and
 * Recents draw in the first frame while sync catches up (ADR 0018). A per-device convenience:
 * sync replaces it at once, and a missing or broken copy only costs that head start.
 */
const SnapshotChat = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  space_id: Schema.NullOr(Schema.String),
  created_by_id: Schema.NullOr(Schema.String),
  title: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  last_message_at: Schema.String,
  permission_mode: Schema.String,
});

const SnapshotSpace = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  created_by_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
});

const Snapshot = Schema.fromJsonString(
  Schema.Struct({
    chats: Schema.Array(SnapshotChat),
    spaces: Schema.Array(SnapshotSpace),
    folders: Schema.Array(FolderInput),
  }),
);

const decode = Schema.decodeUnknownOption(Snapshot);

export interface ChatSnapshot {
  readonly chats: readonly Chat[];
  readonly spaces: readonly ChatSpace[];
  readonly folders: readonly Folder[];
}

const EMPTY: ChatSnapshot = { chats: [], spaces: [], folders: [] };

/** The newest chats are enough for Recents, pins and folders on first paint. */
const MAX_CHATS = 200;

const storageKey = (userId: string, workspaceId: string) =>
  `crm:chat-snapshot:${userId}:${workspaceId}`;

export function readChatSnapshot(userId: string, workspaceId: string): ChatSnapshot {
  try {
    return Option.match(decode(localStorage.getItem(storageKey(userId, workspaceId)) ?? ""), {
      onNone: () => EMPTY,
      onSome: (stored) => ({
        chats: stored.chats,
        spaces: stored.spaces,
        folders: parseSidebarLayout([], stored.folders).folders,
      }),
    });
  } catch {
    return EMPTY;
  }
}

export function writeChatSnapshot(userId: string, workspaceId: string, snapshot: ChatSnapshot) {
  const chats = snapshot.chats
    .toSorted((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .slice(0, MAX_CHATS);

  try {
    localStorage.setItem(
      storageKey(userId, workspaceId),
      JSON.stringify({ chats, spaces: snapshot.spaces, folders: snapshot.folders }),
    );
  } catch {
    // Storage is full or blocked: the next load waits for sync.
  }
}
