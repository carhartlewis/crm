import { describe, expect, test } from "bun:test";
import { listQuery, withListQuery } from "./saved-views.ts";

const keys = new Set(["q", "sort", "owner", "hide"]);

describe("saved view queries", () => {
  test("keep only the list's own keys, sorted", () => {
    expect(listQuery("?sort=name&company=com_1&q=acme&page=2", keys)).toBe("q=acme&sort=name");
    expect(listQuery("", keys)).toBe("");
  });

  test("replace the list's part and keep an open sheet", () => {
    expect(withListQuery("?q=old&company=com_1", keys, "owner=u1&sort=name")).toBe(
      "?company=com_1&owner=u1&sort=name",
    );
    expect(withListQuery("?q=old", keys, "")).toBe("");
  });
});
