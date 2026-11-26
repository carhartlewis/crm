import { describe, expect, test } from "bun:test";
import {
  COLLAPSE_DISTANCE,
  nextOpenState,
  parseSidebarWidth,
  resolveSidebarWidth,
  settledWidth,
  SIDEBAR_WIDTH,
} from "@crm/ui/lib/sidebar-width";

describe("resolveSidebarWidth", () => {
  test("follows the pointer between the limits", () => {
    expect(resolveSidebarWidth(320)).toEqual({ width: 320, zone: "free" });
  });

  test("sticks to the default within a few pixels of it", () => {
    expect(resolveSidebarWidth(SIDEBAR_WIDTH.default + 4)).toEqual({
      width: SIDEBAR_WIDTH.default,
      zone: "default",
    });
  });

  test("resists past either limit", () => {
    const under = resolveSidebarWidth(SIDEBAR_WIDTH.min - 40);
    const over = resolveSidebarWidth(SIDEBAR_WIDTH.max + 40);

    expect(under.zone).toBe("min");
    expect(under.width).toBeLessThan(SIDEBAR_WIDTH.min);
    expect(under.width).toBeGreaterThan(SIDEBAR_WIDTH.min - 40);
    expect(over.zone).toBe("max");
    expect(over.width).toBeLessThan(SIDEBAR_WIDTH.max + 40);
  });
});

describe("nextOpenState", () => {
  const threshold = SIDEBAR_WIDTH.min - COLLAPSE_DISTANCE;

  test("collapses once dragged past the threshold", () => {
    expect(nextOpenState(threshold, true)).toBe(true);
    expect(nextOpenState(threshold - 1, true)).toBe(false);
  });

  test("reopens only past the hysteresis, so it doesn't flicker at the edge", () => {
    expect(nextOpenState(threshold + 8, false)).toBe(false);
    expect(nextOpenState(threshold + 20, false)).toBe(true);
  });
});

describe("settledWidth", () => {
  test("clamps an overdrag back to the limit and keeps a snapped default", () => {
    expect(settledWidth(SIDEBAR_WIDTH.max + 90)).toBe(SIDEBAR_WIDTH.max);
    expect(settledWidth(SIDEBAR_WIDTH.min - 30)).toBe(SIDEBAR_WIDTH.min);
    expect(settledWidth(SIDEBAR_WIDTH.default - 5)).toBe(SIDEBAR_WIDTH.default);
    expect(settledWidth(301.6)).toBe(302);
  });
});

describe("parseSidebarWidth", () => {
  test("accepts stored widths inside the limits only", () => {
    expect(parseSidebarWidth("300")).toBe(300);
    expect(parseSidebarWidth("90")).toBeUndefined();
    expect(parseSidebarWidth("wide")).toBeUndefined();
    expect(parseSidebarWidth(undefined)).toBeUndefined();
  });
});
