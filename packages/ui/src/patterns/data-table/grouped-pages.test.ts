import { describe, expect, it } from "bun:test";
import { groupedPages, groupRows } from "./grouped-pages";

describe("groupedPages", () => {
  it("reserves room for headings and repeats a heading after a page break", () => {
    const rows = ["A1", "A2", "A3", "B1", "B2"];
    expect(groupedPages(rows, 4, (row) => row[0] ?? "")).toEqual([
      { start: 0, rows: ["A1", "A2", "A3"] },
      { start: 3, rows: ["B1", "B2"] },
    ]);
    expect(groupedPages(rows, 3, (row) => row[0] ?? "")).toEqual([
      { start: 0, rows: ["A1", "A2"] },
      { start: 2, rows: ["A3"] },
      { start: 3, rows: ["B1", "B2"] },
    ]);
  });
});

describe("groupRows", () => {
  it("keeps an ungrouped article in its source position between sections", () => {
    const rows = [
      { code: "1.1", section: "Article 1" },
      { code: "1.2", section: "Article 1" },
      { code: "2", section: "" },
      { code: "3.1", section: "Article 3" },
      { code: "4", section: "" },
    ];

    expect(
      groupRows(rows, (row) => row.section).map((group) => group.map((row) => row.code)),
    ).toEqual([["1.1", "1.2"], ["2"], ["3.1"], ["4"]]);
  });
});
