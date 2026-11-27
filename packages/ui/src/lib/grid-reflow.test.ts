import { describe, expect, test } from "bun:test";
import { columnCount, reflowOffsets } from "./grid-reflow";

const two = [
  { left: 0, top: 0 },
  { left: 500, top: 0 },
  { left: 0, top: 200 },
];

const one = [
  { left: 0, top: 0 },
  { left: 0, top: 200 },
  { left: 0, top: 400 },
];

describe("grid reflow", () => {
  test("counts the columns in the first row", () => {
    expect(columnCount(two)).toBe(2);
    expect(columnCount(one)).toBe(1);
    expect(columnCount([])).toBe(0);
  });

  test("moves cards only when the column count changes", () => {
    expect(
      reflowOffsets(
        two,
        two.map((spot) => ({ ...spot, left: spot.left * 1.1 })),
      ),
    ).toBeNull();
    expect(reflowOffsets(two, one)).toEqual([null, { x: 500, y: -200 }, { x: 0, y: -200 }]);
  });
});
