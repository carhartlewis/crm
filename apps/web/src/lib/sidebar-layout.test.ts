import { describe, expect, test } from "bun:test";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { pinKey } from "@crm/core/chat";
import { forgetChat, moveToFolder, pinAt, recentChats, togglePin } from "./sidebar-layout.ts";

const chat = () => createId(ID_PREFIXES.chat);
const folder = () => createId(ID_PREFIXES.folder);

const row = (id: string, by: string, at: string, space: string | null = null) => ({
  id,
  space_id: space,
  created_by_id: by,
  last_message_at: at,
});

describe("sidebar layout", () => {
  test("pinning adds a chat at the end; pinning again unpins it", () => {
    const id = chat();
    const pinned = togglePin([pinKey("page", "companies")], pinKey("chat", id));

    expect(pinned).toEqual(["page:companies", `chat:${id}`]);
    expect(togglePin(pinned, pinKey("chat", id))).toEqual(["page:companies"]);
  });

  test("a chat moves into one folder at a time, at the top", () => {
    const a = chat();
    const b = chat();
    const renewals = folder();
    const later = folder();

    const folders = moveToFolder(
      [
        { id: renewals, name: "Renewals", chatIds: [a] },
        { id: later, name: "Later", chatIds: [b] },
      ],
      a,
      later,
    );

    expect(folders).toEqual([
      { id: renewals, name: "Renewals", chatIds: [] },
      { id: later, name: "Later", chatIds: [a, b] },
    ]);
  });

  test("a deleted chat leaves Pinned and its folder", () => {
    const id = chat();
    const renewals = folder();

    expect(
      forgetChat(
        { pinned: [`chat:${id}`], folders: [{ id: renewals, name: "Renewals", chatIds: [id] }] },
        id,
      ),
    ).toEqual({ pinned: [], folders: [{ id: renewals, name: "Renewals", chatIds: [] }] });
  });

  test("Recents holds your own unplaced chats, newest message first", () => {
    const pinned = chat();
    const filed = chat();
    const older = chat();
    const newer = chat();
    const teammates = chat();

    const recents = recentChats(
      [
        row(pinned, "me", "2026-11-26T10:00:00Z"),
        row(filed, "me", "2026-11-26T11:00:00Z"),
        row(older, "me", "2026-11-25T09:00:00Z"),
        row(newer, "me", "2026-11-26T12:00:00Z"),
        row(teammates, "them", "2026-11-26T13:00:00Z"),
      ],
      { pinned: [`chat:${pinned}`], folders: [{ id: folder(), name: "F", chatIds: [filed] }] },
      "me",
    );

    expect(recents.map((item) => item.id)).toEqual([newer, older]);
  });

  test("Recents also holds teammates' chats in spaces you joined", () => {
    const joined = chat();
    const other = chat();

    const recents = recentChats(
      [
        row(joined, "them", "2026-11-26T13:00:00Z", "spc_joined"),
        row(other, "them", "2026-11-26T14:00:00Z", "spc_other"),
      ],
      { pinned: [], folders: [] },
      "me",
      new Set(["spc_joined"]),
    );

    expect(recents.map((item) => item.id)).toEqual([joined]);
  });

  test("a chat dropped between pins lands in that slot, and moves if already pinned", () => {
    const order = [pinKey("page", "companies"), pinKey("page", "contacts"), pinKey("chat", "a")];

    expect(pinAt(order, pinKey("chat", "b"), 1)).toEqual([
      "page:companies",
      "chat:b",
      "page:contacts",
      "chat:a",
    ]);
    expect(pinAt(order, pinKey("chat", "b"), 3)).toEqual([...order, "chat:b"]);
    expect(pinAt(order, pinKey("chat", "a"), 0)).toEqual([
      "chat:a",
      "page:companies",
      "page:contacts",
    ]);
  });
});
