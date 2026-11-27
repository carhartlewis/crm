import { describe, expect, test } from "bun:test";
import {
  clearSelection,
  emptyCursor,
  extend,
  first,
  last,
  move,
  reconcile,
  toggleActive,
} from "./list-navigation.ts";

const ids = ["a", "b", "c", "d", "e"];
const at = (activeId: string) => ({ ...emptyCursor, activeId });

describe("move", () => {
  test("starts at the top going down and at the bottom going up", () => {
    expect(move(emptyCursor, ids, 1).activeId).toBe("a");
    expect(move(emptyCursor, ids, -1).activeId).toBe("e");
  });

  test("moves and clamps at both ends", () => {
    expect(move(at("b"), ids, 1).activeId).toBe("c");
    expect(move(at("e"), ids, 1).activeId).toBe("e");
    expect(move(at("a"), ids, -1).activeId).toBe("a");
  });

  test("does nothing in an empty list", () => {
    expect(move(emptyCursor, [], 1)).toBe(emptyCursor);
  });
});

describe("first and last", () => {
  test("jump to either end", () => {
    expect(first(at("c"), ids).activeId).toBe("a");
    expect(last(at("c"), ids).activeId).toBe("e");
  });
});

describe("selection", () => {
  test("x toggles the active row", () => {
    const selected = toggleActive(at("b"));

    expect([...selected.selected]).toEqual(["b"]);
    expect([...toggleActive(selected).selected]).toEqual([]);
  });

  test("⇧j extends the selection from the anchor", () => {
    let cursor = extend(at("b"), ids, 1);

    cursor = extend(cursor, ids, 1);
    expect(cursor.activeId).toBe("d");
    expect([...cursor.selected].toSorted()).toEqual(["b", "c", "d"]);
    expect(cursor.anchorId).toBe("b");
  });

  test("extending upward selects the rows above the anchor", () => {
    const cursor = extend(extend(at("d"), ids, -1), ids, -1);

    expect([...cursor.selected].toSorted()).toEqual(["b", "c", "d"]);
  });

  test("Escape clears the selection but keeps the active row", () => {
    const cleared = clearSelection(extend(at("a"), ids, 2));

    expect(cleared.selected.size).toBe(0);
    expect(cleared.activeId).toBe("c");
  });
});

describe("reconcile", () => {
  test("keeps the position when the active row disappears", () => {
    expect(reconcile(at("c"), ["a", "b", "d", "e"], ids).activeId).toBe("d");
    expect(reconcile(at("e"), ["a", "b"], ids).activeId).toBe("b");
  });

  test("drops selected rows that are gone", () => {
    const cursor = { ...emptyCursor, selected: new Set(["a", "z"]) };

    expect([...reconcile(cursor, ids).selected]).toEqual(["a"]);
  });

  test("an emptied list has no active row", () => {
    expect(reconcile(at("a"), [], ["a"]).activeId).toBeNull();
  });
});
