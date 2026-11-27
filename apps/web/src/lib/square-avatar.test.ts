import { describe, expect, test } from "bun:test";
import { centreSquare } from "./square-avatar.ts";

describe("centreSquare", () => {
  test("crops the middle of a landscape picture", () => {
    expect(centreSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
  });

  test("crops the middle of a portrait picture", () => {
    expect(centreSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
  });

  test("keeps a square picture whole", () => {
    expect(centreSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});
