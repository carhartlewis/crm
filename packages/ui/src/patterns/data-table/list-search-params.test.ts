import { describe, expect, it } from "bun:test";
import { createLoader } from "nuqs";

import {
  LIST_SEARCH_PARAM,
  listSearchParamsFor,
  type ReservedKeyCheck,
} from "./list-search-params";

const RESERVED: ReadonlySet<string> = new Set([
  ...Object.values(LIST_SEARCH_PARAM),
  "invite",
  "invite-page",
]);

const assertUnreserved: ReservedKeyCheck = (keys, owner) => {
  const clashes = keys.filter((key) => RESERVED.has(key));

  if (clashes.length > 0) {
    throw new Error(`[${owner}] keys already taken: ${clashes.join(", ")}`);
  }
};

const createListSearchParams = listSearchParamsFor(assertUnreserved);

const VALUES = {
  q: "  access  ",
  sort: "name",
  dir: "desc" as const,
  page: 3,
  fields: { region: ["eu"] },
  tab: "overdue",
  facets: { status: ["open"] },
};

describe("createListSearchParams", () => {
  it("reads a URL with no list state as the first page, unsorted", () => {
    const { parsers } = createListSearchParams();
    const values = createLoader(parsers)("");

    expect(values.page).toBe(1);
    expect(values.sort).toBe("");
  });

  it("declares a parser for the tab and every facet", () => {
    const { parsers } = createListSearchParams({
      tabId: "view",
      facetIds: ["status", "owner"],
    });

    expect(Object.keys(parsers).toSorted()).toEqual([
      "dir",
      "fields",
      "owner",
      "page",
      "q",
      "sort",
      "status",
      "view",
    ]);
    expect(parsers.status?.defaultValue).toEqual([]);
    expect(parsers.owner?.defaultValue).toEqual([]);
    expect(parsers.view?.defaultValue).toBe("all");
    expect(parsers.sort.defaultValue).toBe("");
  });

  it("uses the configured sort, direction and facet defaults", () => {
    const { parsers } = createListSearchParams<never, "status">({
      defaultSort: "createdAt",
      defaultDir: "desc",
      facetIds: ["status"],
      facetDefaults: { status: ["open"] },
    });

    expect(parsers.sort.defaultValue).toBe("createdAt");
    expect(parsers.dir.defaultValue).toBe("desc");
    expect(parsers.status?.defaultValue).toEqual(["open"]);
  });

  it("builds the list input from URL values", () => {
    const { toInput } = createListSearchParams<"view", "status" | "owner">({
      pageSize: 10,
      tabId: "view",
      facetIds: ["status", "owner"],
      facetDefaults: { owner: ["me"] },
    });

    expect(toInput(VALUES)).toEqual({
      q: "access",
      sort: "name",
      dir: "desc",
      page: 3,
      pageSize: 10,
      fields: { region: ["eu"] },
      view: "overdue",
      status: ["open"],
      owner: ["me"],
    });
  });

  it("turns a page below one into the first page", () => {
    const { toInput } = createListSearchParams();

    expect(toInput({ ...VALUES, page: 0 }).page).toBe(1);
    expect(toInput({ ...VALUES, page: -4 }).page).toBe(1);
  });

  it("refuses a tab or facet key that another feature already owns", () => {
    expect(() => createListSearchParams({ tabId: "invite" })).toThrow(/invite/);
    expect(() => createListSearchParams({ facetIds: ["q", "invite"] })).toThrow(/q, invite/);
  });

  it("puts the scope before every URL key", () => {
    const { parsers, urlKeys } = createListSearchParams({
      scope: "people",
      tabId: "view",
    });

    expect(urlKeys).toEqual({
      q: "people-q",
      sort: "people-sort",
      dir: "people-dir",
      page: "people-page",
      fields: "people-fields",
      view: "people-view",
    });

    const values = createLoader(parsers, { urlKeys })("?q=page&people-q=ada&people-view=invited");

    expect(values.q).toBe("ada");
    expect(values.view).toBe("invited");
  });

  it("keeps the plain URL keys without a scope", () => {
    expect(createListSearchParams().urlKeys).toEqual({});
  });

  it("refuses a scope whose URL keys another feature already owns", () => {
    expect(() => createListSearchParams({ scope: "invite" })).toThrow(/invite-page/);
  });

  it("refuses a tab or facet id that looks like a field filter", () => {
    expect(() => createListSearchParams({ facetIds: ["status", "field:region"] })).toThrow(
      /field filters: field:region/,
    );
    expect(() => createListSearchParams({ tabId: "field:view" })).toThrow(
      /field filters: field:view/,
    );
  });

  it("refuses a facet id that repeats the tab id", () => {
    expect(() => createListSearchParams({ tabId: "status", facetIds: ["status"] })).toThrow(
      /unique: status/,
    );
  });

  it("refuses a facet id listed twice", () => {
    expect(() => createListSearchParams({ facetIds: ["owner", "status", "owner"] })).toThrow(
      /unique: owner/,
    );
  });
});
