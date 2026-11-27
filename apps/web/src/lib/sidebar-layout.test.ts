import { describe, expect, test } from "bun:test";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { pinKey } from "@crm/core/chat";
import { forgetChat, moveToFolder, recentChats, togglePin } from "./sidebar-layout.ts";

const chat = () => createId(ID_PREFIXES.chat);
const folder = () => createId(ID_PREFIXES.folder);

const row = (id: string, by: string, at: string) => ({
  id,
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
});
