import { describe, expect, test } from "bun:test";
import { isoTimestamp } from "./sync-collections.ts";

describe("isoTimestamp", () => {
  test("turns Postgres timestamptz text into ISO", () => {
    expect(isoTimestamp("2026-11-26 23:53:53.944+00")).toBe("2026-11-26T23:53:53.944Z");
    expect(isoTimestamp("2026-11-26 18:00:00-05")).toBe("2026-11-26T23:00:00.000Z");
  });

  test("keeps ISO input and leaves unparseable text alone", () => {
    expect(isoTimestamp("2026-11-26T23:53:53.944Z")).toBe("2026-11-26T23:53:53.944Z");
    expect(isoTimestamp("not a date")).toBe("not a date");
  });
});
