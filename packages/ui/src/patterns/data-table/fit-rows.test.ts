import { describe, expect, test } from "bun:test";
import { fitRowCount } from "./fit-rows";

const TABLE = { headerHeight: 42, rowHeight: 45, footerHeight: 44 };

describe("fitRowCount", () => {
  test("gives the number of whole rows that fit below the header and above the pages", () => {
    expect(fitRowCount({ ...TABLE, height: 581 })).toBe(11);
  });

  test("does not count a row that only fits in part", () => {
    expect(fitRowCount({ ...TABLE, height: 580 })).toBe(10);
  });

  test("shows one row or more when the space is too small", () => {
    expect(fitRowCount({ ...TABLE, height: 20 })).toBe(1);
  });
});
