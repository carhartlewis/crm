import { describe, expect, test } from "bun:test";
import { createId, ID_PREFIXES } from "../ids/index.ts";
import {
  decodeStoredLayout,
  normalizeChatTitle,
  normalizeSpaceName,
  parsePinKey,
  parseSidebarLayout,
  titleFromMessage,
} from "./index.ts";

const chat = () => createId(ID_PREFIXES.chat);
const folder = () => createId(ID_PREFIXES.folder);

describe("chat titles", () => {
  test("a short first line becomes the title as written", () => {
    expect(titleFromMessage("  Who signs off on budget at Acme?\nMore detail")).toBe(
      "Who signs off on budget at Acme?",
    );
  });

  test("a long first line is cut at a word with an ellipsis", () => {
    const title = titleFromMessage(
      "Look through these meeting notes and update slide fourteen with the new story we agreed",
    );

    expect(title).toBe("Look through these meeting notes and update slide fourteen…");
    expect(title.length).toBeLessThanOrEqual(61);
  });

  test("an empty message gives a placeholder title", () => {
    expect(titleFromMessage("   ")).toBe("New chat");
  });

  test("titles and space names are trimmed and limited", () => {
    expect(normalizeChatTitle("  Q4   forecast ")).toEqual({ ok: true, value: "Q4 forecast" });
    expect(normalizeChatTitle(" ").ok).toBe(false);
    expect(normalizeSpaceName("x".repeat(61)).ok).toBe(false);
  });
});

describe("sidebar layout", () => {
  test("pin keys name a page, a space or a chat with a valid id", () => {
    const id = chat();

    expect(parsePinKey(`chat:${id}`)).toEqual({ kind: "chat", id });
    expect(parsePinKey("page:companies")).toEqual({ kind: "page", id: "companies" });
    expect(parsePinKey("chat:nope")).toBeUndefined();
    expect(parsePinKey("record:companies")).toBeUndefined();
  });

  test("bad pins, duplicates and malformed folders are dropped", () => {
    const a = chat();
    const b = chat();
    const first = folder();
    const second = folder();

    const layout = parseSidebarLayout(
      ["page:companies", `chat:${a}`, `chat:${a}`, "space:bad"],
      [
        { id: first, name: " Renewals ", chatIds: [a, "x", a] },
        { id: second, name: "Later", chatIds: [a, b] },
        { id: first, name: "Duplicate", chatIds: [] },
        { id: "fld_short", name: "Bad id", chatIds: [] },
      ],
    );

    expect(layout).toEqual({
      pinned: ["page:companies", `chat:${a}`],
      folders: [
        { id: first, name: "Renewals", chatIds: [a] },
        // A chat sits in one folder only: the first that lists it.
        { id: second, name: "Later", chatIds: [b] },
      ],
    });
  });

  test("a malformed stored row reads as an empty layout", () => {
    expect(decodeStoredLayout({ pinned: null, folders: { folders: [] } })).toEqual({
      pinned: [],
      folders: [],
    });
    expect(decodeStoredLayout({ pinned: ["page:companies"], folders: [] }).pinned).toEqual([
      "page:companies",
    ]);
  });
});
