import { describe, expect, it } from "bun:test";

import {
  formatCalendarDate,
  formatDateTime,
  parseCalendarDate,
  parseDateTime,
  parseTime,
} from "./calendar-date";

describe("calendar dates", () => {
  it("round-trips in local time", () => {
    const date = parseCalendarDate("2026-11-26");

    expect(date?.getDate()).toBe(26);
    expect(date && formatCalendarDate(date)).toBe("2026-11-26");
  });

  it("rejects text and dates that roll over", () => {
    expect(parseCalendarDate("")).toBeUndefined();
    expect(parseCalendarDate(null)).toBeUndefined();
    expect(parseCalendarDate("2026-02-31")).toBeUndefined();
  });
});

describe("parseTime", () => {
  it("reads 12- and 24-hour times", () => {
    expect(parseTime("9")).toEqual({ hours: 9, minutes: 0 });
    expect(parseTime("9am")).toEqual({ hours: 9, minutes: 0 });
    expect(parseTime("12 am")).toEqual({ hours: 0, minutes: 0 });
    expect(parseTime("12pm")).toEqual({ hours: 12, minutes: 0 });
    expect(parseTime("9:30 p.m.")).toEqual({ hours: 21, minutes: 30 });
    expect(parseTime("930")).toEqual({ hours: 9, minutes: 30 });
    expect(parseTime("21:05")).toEqual({ hours: 21, minutes: 5 });
  });

  it("rejects times that don't exist", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("9:75")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
});

describe("date-times", () => {
  it("round-trips the datetime-local format", () => {
    const parsed = parseDateTime("2026-11-26T09:05");

    expect(parsed?.time).toEqual({ hours: 9, minutes: 5 });
    expect(parsed && formatDateTime(parsed.date, parsed.time)).toBe("2026-11-26T09:05");
  });
});
