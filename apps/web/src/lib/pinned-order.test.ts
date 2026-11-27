import { describe, expect, test } from "bun:test";
import { moveItem, normalizeOrder, parseStoredOrder } from "./pinned-order.ts";

describe("normalizeOrder", () => {
  test("keeps the saved order and appends pages added since", () => {
    expect(normalizeOrder(["workflows", "companies"])).toEqual([
      "workflows",
      "companies",
      "contacts",
    ]);
  });

  test("drops unknown and duplicate ids, and survives garbage", () => {
    expect(normalizeOrder(["deals", "contacts", "contacts"])).toEqual([
      "contacts",
      "companies",
      "workflows",
    ]);
  });
});

describe("parseStoredOrder", () => {
  test("reads a JSON list of strings and treats anything else as empty", () => {
    expect(parseStoredOrder('["contacts", 3, "companies"]')).toEqual(["contacts", "companies"]);
    expect(parseStoredOrder('{"not":"a list"}')).toEqual([]);
    expect(parseStoredOrder("not json")).toEqual([]);
    expect(parseStoredOrder(null)).toEqual([]);
  });
});

describe("moveItem", () => {
  test("moves down and up, shifting the items between", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  test("leaves the input untouched", () => {
    const items = ["a", "b"];

    moveItem(items, 0, 1);

    expect(items).toEqual(["a", "b"]);
  });
});
