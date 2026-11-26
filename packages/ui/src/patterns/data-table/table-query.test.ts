import { describe, expect, it } from "bun:test";

import {
  currentPage,
  fieldFilterKey,
  fieldFiltersWith,
  scopedKey,
  sortToggle,
  tableFilters,
} from "./table-query";

describe("currentPage", () => {
  it("keeps a page number from the URL", () => {
    expect(currentPage(3)).toBe(3);
  });

  it("starts at the first page for a number below one", () => {
    expect(currentPage(0)).toBe(1);
  });
});

describe("sortToggle", () => {
  it("flips the direction of the column already sorted", () => {
    expect(sortToggle({ sort: "name", dir: "asc" }, "name", "desc")).toEqual({
      dir: "desc",
      page: 1,
    });
  });

  it("sorts a new column in the default direction", () => {
    expect(sortToggle({ sort: "name", dir: "asc" }, "status", "desc")).toEqual({
      sort: "status",
      dir: "desc",
      page: 1,
    });
  });
});

describe("scopedKey", () => {
  it("keeps the key without a scope", () => {
    expect(scopedKey(undefined, "hide")).toBe("hide");
  });

  it("puts the scope before the key", () => {
    expect(scopedKey("people", "hide")).toBe("people-hide");
  });
});

describe("fieldFilterKey", () => {
  it("reads the field a field filter names", () => {
    expect(fieldFilterKey("field:region")).toBe("region");
  });

  it("answers null for a facet filter", () => {
    expect(fieldFilterKey("status")).toBeNull();
  });
});

describe("fieldFiltersWith", () => {
  it("sets the values of one field and keeps the others", () => {
    expect(fieldFiltersWith({ region: ["eu"], tier: ["gold"] }, "region", ["us"])).toEqual({
      region: ["us"],
      tier: ["gold"],
    });
  });

  it("drops a field with no values left", () => {
    expect(fieldFiltersWith({ region: ["eu"], tier: ["gold"] }, "region", [])).toEqual({
      tier: ["gold"],
    });
  });
});

describe("tableFilters", () => {
  it("lists the tab, every facet and every field filter", () => {
    expect(
      tableFilters({
        tabId: "view",
        tab: "open",
        facets: { status: ["done"], owner: [] },
        fields: { region: ["eu"] },
      }),
    ).toEqual({
      view: ["open"],
      status: ["done"],
      owner: [],
      "field:region": ["eu"],
    });
  });

  it("leaves the tab out of a table with no tabs", () => {
    expect(tableFilters({ tabId: undefined, tab: "all", facets: {}, fields: {} })).toEqual({});
  });
});
