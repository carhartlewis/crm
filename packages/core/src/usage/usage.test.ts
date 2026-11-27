import { describe, expect, test } from "bun:test";
import {
  callUsageLabel,
  formatUsage,
  isUsageMonth,
  priceFor,
  totalUsage,
  usageDollars,
  usageMonthRange,
} from "./index.ts";

describe("usage prices", () => {
  test("adds the markup and never rounds a priced call to free", () => {
    expect(priceFor(4950, 0)).toBe(4950);
    expect(priceFor(4950, 2000)).toBe(5940);
    expect(priceFor(1, 1)).toBe(2);
    expect(priceFor(-5, 500)).toBe(0);
    // The markup is capped at 10× cost.
    expect(priceFor(100, 10_000_000)).toBe(1100);
  });

  test("formats prices for people", () => {
    expect(formatUsage(0)).toBe("Free");
    expect(formatUsage(4950)).toBe("<$0.01");
    expect(formatUsage(240_000)).toBe("$0.24");
    expect(formatUsage(12_800_000)).toBe("$12.80");
    expect(formatUsage(1_240_400_000)).toBe("$1,240");
  });

  test("labels a call by its price, or why it was free", () => {
    expect(callUsageLabel({ priceMicro: 240_000, outcome: "hit" })).toBe("$0.24");
    expect(callUsageLabel({ priceMicro: 0, outcome: "miss" })).toBe("No charge");
    expect(callUsageLabel({ priceMicro: 0, outcome: "cached" })).toBe("Saved");
  });

  test("sums calls and writes exact dollars for exports", () => {
    expect(totalUsage([{ priceMicro: 4950 }, { priceMicro: 1500 }, { priceMicro: -3 }])).toBe(6450);
    expect(usageDollars(4950)).toBe("0.004950");
  });
});

describe("usage months", () => {
  test("reads a billing month and its range", () => {
    expect(isUsageMonth("2026-11")).toBe(true);
    expect(isUsageMonth("2026-13")).toBe(false);
    expect(isUsageMonth("26-11")).toBe(false);

    const { start, end } = usageMonthRange("2026-12");

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
