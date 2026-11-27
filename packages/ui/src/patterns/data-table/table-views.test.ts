import { describe, expect, it } from "bun:test";

import { type TableView, tableViews } from "./table-views";

type Row = { done: boolean };

const VIEWS: TableView<Row>[] = [
  { value: "open", label: "Open", test: (row) => !row.done },
  { value: "done", label: "Done", test: (row) => row.done },
];

const ROWS: Row[] = [{ done: true }, { done: false }, { done: false }];

describe("tableViews", () => {
  it("counts the rows in each view", () => {
    expect(tableViews(VIEWS, ROWS, "all").counts).toEqual({ open: 2, done: 1 });
  });

  it("filters by the active view", () => {
    const { where } = tableViews(VIEWS, ROWS, "done");

    expect(ROWS.filter((row) => where?.(row) ?? true)).toEqual([{ done: true }]);
  });

  it("filters nothing when no view is active", () => {
    expect(tableViews(VIEWS, ROWS, "all").where).toBeUndefined();
  });

  it("offers each view as an option without its test", () => {
    expect(tableViews(VIEWS, ROWS, "all").options).toEqual([
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ]);
  });
});
