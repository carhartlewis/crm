import { describe, expect, test } from "bun:test";
import { pinnedInsertIndex, sameDrop } from "./chat-drag.ts";

// Three pinned rows, 32 px tall, at their places 4, 5 and 7 in the whole pinned order.
const rows = [
  { pinIndex: 4, top: 0, bottom: 32 },
  { pinIndex: 5, top: 32, bottom: 64 },
  { pinIndex: 7, top: 64, bottom: 96 },
];

describe("dragging a chat onto Pinned", () => {
  test("it lands before the first row whose middle is below the pointer", () => {
    expect(pinnedInsertIndex(rows, 10)).toBe(4);
    expect(pinnedInsertIndex(rows, 20)).toBe(5);
    expect(pinnedInsertIndex(rows, 70)).toBe(7);
  });

  test("below the last middle it lands after the last row; with no rows, nowhere", () => {
    expect(pinnedInsertIndex(rows, 90)).toBe(8);
    expect(pinnedInsertIndex([], 10)).toBeNull();
  });

  test("a new slot or target is a new place (a haptic tick); the same one is not", () => {
    expect(sameDrop({ kind: "pinned", index: 4 }, { kind: "pinned", index: 4 })).toBe(true);
    expect(sameDrop({ kind: "pinned", index: 4 }, { kind: "pinned", index: 5 })).toBe(false);
    expect(sameDrop({ kind: "folder", id: "fld_a" }, { kind: "space", id: "fld_a" })).toBe(false);
    expect(sameDrop(null, { kind: "folder", id: "fld_a" })).toBe(false);
    expect(sameDrop(null, null)).toBe(true);
  });
});
