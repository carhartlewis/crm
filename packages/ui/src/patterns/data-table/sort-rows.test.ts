import { describe, expect, it } from "bun:test";

import { byDate, byFlag, byNumber, byText, sortRows } from "./sort-rows";

type Row = { id: string; code: string; done: boolean; at: string | null };

const ROWS: Row[] = [
  { id: "a", code: "CC1.10", done: true, at: "2026-03-01T00:00:00.000Z" },
  { id: "b", code: "cc1.2", done: false, at: null },
  { id: "c", code: "CC1.9", done: true, at: "2026-01-01T00:00:00.000Z" },
  { id: "d", code: "", done: false, at: "2026-02-01T00:00:00.000Z" },
];

function ids(rows: readonly { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

describe("sortRows", () => {
  it("puts codes in natural order and ignores case", () => {
    expect(
      ids(
        sortRows(
          ROWS,
          byText((row) => row.code),
          "asc",
          "en",
        ),
      ),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("reverses the order for desc but keeps empty values last", () => {
    expect(
      ids(
        sortRows(
          ROWS,
          byText((row) => row.code),
          "desc",
          "en",
        ),
      ),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("sorts dates and keeps null values last", () => {
    expect(
      ids(
        sortRows(
          ROWS,
          byDate((row) => row.at),
          "asc",
          "en",
        ),
      ),
    ).toEqual(["c", "d", "a", "b"]);
    expect(
      ids(
        sortRows(
          ROWS,
          byDate((row) => row.at),
          "desc",
          "en",
        ),
      ),
    ).toEqual(["a", "d", "c", "b"]);
  });

  it("keeps the given order for rows with the same value", () => {
    expect(
      ids(
        sortRows(
          ROWS,
          byFlag((row) => row.done),
          "asc",
          "en",
        ),
      ),
    ).toEqual(["b", "d", "a", "c"]);
    expect(
      ids(
        sortRows(
          ROWS,
          byFlag((row) => row.done),
          "desc",
          "en",
        ),
      ),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("sorts numbers by value", () => {
    const counts = [
      { id: "x", n: 10 },
      { id: "y", n: 2 },
      { id: "z", n: 33 },
    ];

    expect(
      ids(
        sortRows(
          counts,
          byNumber((row) => row.n),
          "asc",
          "en",
        ),
      ),
    ).toEqual(["y", "x", "z"]);
  });

  it("does not change the input", () => {
    const input = [...ROWS];

    sortRows(
      input,
      byText((row) => row.code),
      "asc",
      "en",
    );

    expect(ids(input)).toEqual(["a", "b", "c", "d"]);
  });
});
