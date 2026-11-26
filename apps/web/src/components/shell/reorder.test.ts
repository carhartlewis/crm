import { describe, expect, test } from "bun:test";
import { siblingShift, slotIndex } from "./reorder.ts";

// Four 32px rows with a 2px gap: centers at 16, 50, 84, 118.
const centers = [16, 50, 84, 118];

describe("slotIndex", () => {
  test("stays put until the dragged center passes a neighbour's center", () => {
    expect(slotIndex(centers, 0, 40)).toBe(0);
    expect(slotIndex(centers, 0, 51)).toBe(1);
    expect(slotIndex(centers, 0, 200)).toBe(3);
  });

  test("moves up past earlier items", () => {
    expect(slotIndex(centers, 3, 60)).toBe(2);
    expect(slotIndex(centers, 3, -20)).toBe(0);
  });
});

describe("siblingShift", () => {
  test("dragging down slides the passed items up by one pitch", () => {
    expect([0, 1, 2, 3].map((i) => siblingShift(i, 0, 2, 34))).toEqual([0, -34, -34, 0]);
  });

  test("dragging up slides the passed items down by one pitch", () => {
    expect([0, 1, 2, 3].map((i) => siblingShift(i, 3, 1, 34))).toEqual([0, 34, 34, 0]);
  });
});
