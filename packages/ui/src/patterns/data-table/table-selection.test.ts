import { describe, expect, it } from "bun:test";

import {
  EMPTY_SELECTION,
  keptOnPage,
  pageKeyOf,
  selectionSummary,
  withRow,
  withRows,
} from "./table-selection";

describe("pageKeyOf", () => {
  it("names the same rows the same way in any order", () => {
    expect(pageKeyOf(["b", "a"])).toBe(pageKeyOf(["a", "b"]));
  });

  it("names different rows differently", () => {
    expect(pageKeyOf(["a", "b"])).not.toBe(pageKeyOf(["a", "c"]));
  });
});

describe("keptOnPage", () => {
  it("drops the rows that left the page", () => {
    expect([...keptOnPage(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
  });

  it("keeps the same set when every picked row is still on the page", () => {
    const picked = new Set(["a"]);

    expect(keptOnPage(picked, ["a", "b"])).toBe(picked);
  });

  it("keeps an empty selection as it is", () => {
    expect(keptOnPage(EMPTY_SELECTION, ["a"])).toBe(EMPTY_SELECTION);
  });
});

describe("withRow", () => {
  it("adds a row the person ticks", () => {
    expect([...withRow(EMPTY_SELECTION, "a", true)]).toEqual(["a"]);
  });

  it("removes a row the person unticks", () => {
    expect([...withRow(new Set(["a", "b"]), "a", false)]).toEqual(["b"]);
  });
});

describe("withRows", () => {
  it("adds every row on the page", () => {
    expect([...withRows(new Set(["x"]), ["a", "b"], true)]).toEqual(["x", "a", "b"]);
  });

  it("removes only the rows on the page", () => {
    expect([...withRows(new Set(["x", "a"]), ["a", "b"], false)]).toEqual(["x"]);
  });
});

describe("selectionSummary", () => {
  it("lists the picked rows in page order", () => {
    expect(selectionSummary(new Set(["c", "a"]), ["a", "b", "c"])).toMatchObject({
      ids: ["a", "c"],
      count: 2,
    });
  });

  it("marks the page as all selected when every row is picked", () => {
    expect(selectionSummary(new Set(["a", "b"]), ["a", "b"])).toMatchObject({
      allSelected: true,
      someSelected: false,
    });
  });

  it("marks the page as partly selected when some rows are picked", () => {
    expect(selectionSummary(new Set(["a"]), ["a", "b"])).toMatchObject({
      allSelected: false,
      someSelected: true,
    });
  });

  it("never marks an empty page as all selected", () => {
    expect(selectionSummary(EMPTY_SELECTION, [])).toMatchObject({
      allSelected: false,
      someSelected: false,
    });
  });
});
