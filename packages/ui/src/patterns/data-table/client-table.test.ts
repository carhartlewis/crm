import { describe, expect, it } from "bun:test";

import { clientTable } from "./client-table";

type Row = { id: string; name: string; status: string; tags: string[] };

const ROWS: Row[] = [
  { id: "1", name: "Access review", status: "open", tags: ["iam"] },
  { id: "2", name: "Backup test", status: "done", tags: ["ops", "iam"] },
  { id: "3", name: "Vendor audit", status: "open", tags: [] },
  { id: "4", name: "Access logs", status: "done", tags: ["ops"] },
];

type Input = {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  status: string[];
  tag: string[];
};

const BASE: Input = {
  q: "",
  sort: "",
  dir: "asc",
  page: 1,
  pageSize: 10,
  status: [],
  tag: [],
};

function table(input: Partial<Input> = {}) {
  return clientTable({
    rows: ROWS,
    input: { ...BASE, ...input },
    haystack: (row) => row.name,
    sortValues: {
      name: (row) => row.name.toLowerCase(),
      status: (row) => row.status,
    },
    facetOf: {
      status: (row) => row.status,
      tag: (row) => row.tags,
    },
    tieBreak: (left, right) => left.id.localeCompare(right.id),
  });
}

function ids(rows: Row[]): string[] {
  return rows.map((row) => row.id);
}

describe("clientTable", () => {
  it("keeps groups apart in either sort direction", () => {
    for (const dir of ["asc", "desc"] as const) {
      const result = clientTable({
        rows: ROWS,
        input: { ...BASE, sort: "name", dir },
        haystack: (row) => row.name,
        sortValues: { name: (row) => row.name.toLowerCase() },
        facetOf: { status: (row) => row.status, tag: (row) => row.tags },
        groupOf: (row) => (row.status === "open" ? 0 : 1),
      });

      expect(ids(result.rows)).toEqual(dir === "asc" ? ["1", "3", "4", "2"] : ["3", "1", "2", "4"]);
    }
  });

  it("returns every row, unsorted, when nothing is chosen", () => {
    const result = table();

    expect(ids(result.rows)).toEqual(["1", "2", "3", "4"]);
    expect(result.total).toBe(4);
  });

  it("searches the haystack without regard to case or padding", () => {
    expect(ids(table({ q: "  ACCESS " }).visible)).toEqual(["1", "4"]);
  });

  it("keeps rows that match any chosen value of a facet", () => {
    expect(ids(table({ status: ["done"] }).visible)).toEqual(["2", "4"]);
    expect(ids(table({ tag: ["iam"] }).visible)).toEqual(["1", "2"]);
  });

  it("requires every facet with a choice to match", () => {
    expect(ids(table({ status: ["open"], tag: ["iam"] }).visible)).toEqual(["1"]);
  });

  it("counts facet values across all rows, not just the visible ones", () => {
    const result = table({ status: ["open"] });

    expect(result.facetCounts.status).toEqual({ open: 2, done: 2 });
    expect(result.facetCounts.tag).toEqual({ iam: 2, ops: 2 });
  });

  it("sorts both ways and breaks ties with tieBreak", () => {
    expect(ids(table({ sort: "name" }).rows)).toEqual(["4", "1", "2", "3"]);
    expect(ids(table({ sort: "name", dir: "desc" }).rows)).toEqual(["3", "2", "1", "4"]);
    expect(ids(table({ sort: "status" }).rows)).toEqual(["2", "4", "1", "3"]);
  });

  it("ignores a sort key from the URL that names an object method", () => {
    expect(ids(table({ sort: "valueOf" }).rows)).toEqual(["1", "2", "3", "4"]);
  });

  it("ignores a sort key it has no reader for", () => {
    expect(ids(table({ sort: "unknown" }).rows)).toEqual(["1", "2", "3", "4"]);
  });

  it("pages the visible rows and clamps a page past the end", () => {
    expect(ids(table({ pageSize: 3, page: 2 }).rows)).toEqual(["4"]);
    expect(ids(table({ pageSize: 3, page: 9 }).rows)).toEqual(["4"]);
    expect(ids(table({ pageSize: 3, page: 0 }).rows)).toEqual(["1", "2", "3"]);
    expect(table({ pageSize: 3, page: 2 }).total).toBe(4);
  });

  it("applies where before searching and faceting", () => {
    const result = clientTable({
      rows: ROWS,
      input: BASE,
      haystack: (row) => row.name,
      sortValues: {},
      facetOf: { status: (row) => row.status },
      where: (row) => row.tags.length > 0,
    });

    expect(ids(result.visible)).toEqual(["1", "2", "4"]);
  });
});
