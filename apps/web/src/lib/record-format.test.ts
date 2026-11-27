import { describe, expect, test } from "bun:test";
import { calendarDate, daysSince, relativeTime } from "./record-format.ts";

const now = Date.parse("2026-11-26T12:00:00Z");

describe("relativeTime", () => {
  test("reads recent moments in minutes, hours and days", () => {
    expect(relativeTime("2026-11-26T11:59:30Z", now)).toBe("now");
    expect(relativeTime("2026-11-26T11:34:00Z", now)).toBe("26m ago");
    expect(relativeTime("2026-11-26T10:00:00Z", now)).toBe("2h ago");
    expect(relativeTime("2026-11-23T12:00:00Z", now)).toBe("3d ago");
  });

  test("shows the date after a month, with the year only when it differs", () => {
    expect(relativeTime("2026-07-09T12:00:00Z", now)).toBe("Jul 9");
    expect(relativeTime("2025-07-09T12:00:00Z", now)).toBe("Jul 9, 2025");
    expect(relativeTime(null, now)).toBeNull();
  });
});

describe("calendarDate", () => {
  test("formats a stored date without shifting a day", () => {
    expect(calendarDate("2026-08-29")).toBe("Aug 29, 2026");
    expect(calendarDate(null)).toBeNull();
  });
});

describe("daysSince", () => {
  test("counts whole days, never negative", () => {
    expect(daysSince("2026-11-22T13:00:00Z", now)).toBe(3);
    expect(daysSince("2026-11-27T13:00:00Z", now)).toBe(0);
  });
});
