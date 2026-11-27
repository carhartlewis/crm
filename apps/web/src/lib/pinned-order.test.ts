import { describe, expect, test } from "bun:test";
import { moveItem, normalizeOrder, parseStoredOrder } from "./pinned-order.ts";

describe("normalizeOrder", () => {
  test("puts a page added since where the default order has it", () => {
    expect(normalizeOrder(["page:companies", "page:contacts", "page:workflows"])).toEqual([
      "page:companies",
      "page:contacts",
      "page:deals",
      "page:workflows",
    ]);
  });

  test("keeps the saved order, and adds new pages after every page saved before them", () => {
    expect(normalizeOrder(["page:workflows", "page:companies"])).toEqual([
      "page:workflows",
      "page:companies",
      "page:contacts",
      "page:deals",
    ]);
  });

  test("reads bare page ids saved before chats", () => {
    expect(normalizeOrder(["workflows", "companies"])).toEqual([
      "page:workflows",
      "page:companies",
      "page:contacts",
      "page:deals",
    ]);
  });

  test("keeps pinned chats and spaces in place", () => {
    const chat = "chat:cht_0123456789ABCDEFGHIJKLMN";

    expect(normalizeOrder([chat, "page:contacts"])).toEqual([
      chat,
      "page:contacts",
      "page:deals",
      "page:workflows",
      "page:companies",
    ]);
  });

  test("drops unknown and duplicate ids, and survives garbage", () => {
    expect(
      normalizeOrder(["reports", "page:reports", "chat:nope", "contacts", "contacts"]),
    ).toEqual(["page:contacts", "page:deals", "page:workflows", "page:companies"]);
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
