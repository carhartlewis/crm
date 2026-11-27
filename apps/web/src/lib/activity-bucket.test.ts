import { describe, expect, test } from "bun:test";
import { activityBuckets } from "./activity-bucket.ts";

const today = "2026-11-26";
const endOfToday = new Date(`${today}T23:59:59.999`).getTime();
const daysAgo = (days: number) => new Date(endOfToday - days * 86_400_000).toISOString();

describe("activity buckets", () => {
  test("ranges nest", () => {
    expect(activityBuckets(daysAgo(3), today)).toEqual(["7d", "30d", "90d"]);
    expect(activityBuckets(daysAgo(20), today)).toEqual(["30d", "90d"]);
    expect(activityBuckets(daysAgo(60), today)).toEqual(["90d"]);
  });

  test("older than 90 days, or never", () => {
    expect(activityBuckets(daysAgo(91), today)).toEqual(["older"]);
    expect(activityBuckets(null, today)).toEqual(["never"]);
  });
});
