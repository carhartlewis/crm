/**
 * How record dates read in tables and sheets: "2h ago", "Jul 9", "Aug 29, 2026". Pure, with the
 * clock injected, so it is tested directly.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const fullDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Recent moments as "now", "26m ago", "2h ago", "3d ago" (under 30 days), then the date: "Jul 9"
 * this year, "Jul 9, 2025" before.
 */
export function relativeTime(iso: string | null, now = Date.now()) {
  if (!iso) return null;

  const at = new Date(iso);
  const elapsed = now - at.getTime();

  if (Number.isNaN(elapsed)) return null;

  if (elapsed < MINUTE) return "now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;

  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;

  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;

  return at.getFullYear() === new Date(now).getFullYear()
    ? monthDay.format(at)
    : fullDate.format(at);
}

/** A calendar date (`YYYY-MM-DD`) as "Aug 29, 2026"; read as UTC so it never shifts a day. */
export function calendarDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : fullDate.format(date);
}

/** A moment as its calendar date: "Apr 16, 2026". */
export function momentDate(iso: string | null) {
  if (!iso) return null;

  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        date,
      );
}

/** The time of day, 24-hour: "14:06". */
export function timeOfDay(iso: string) {
  return clock.format(new Date(iso));
}

/** The local `YYYY-MM-DD` for a moment, for grouping and the Closing filter. */
export function localDay(at: number | Date = Date.now()) {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** An activity feed's day heading: "Today", "Yesterday", then "Aug 3". */
export function dayHeading(iso: string, now = Date.now()) {
  const day = localDay(new Date(iso));

  if (day === localDay(now)) return "Today";

  if (day === localDay(now - DAY)) return "Yesterday";

  return monthDay.format(new Date(iso));
}

/** How long ago, in whole days, for "Overdue 4d ago" and "In stage 3d ago". */
export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
}

/** How long something has lasted, for "In stage": "Under a day", "1 day", "12 days". */
export function durationSince(iso: string | null, now = Date.now()) {
  if (!iso) return null;

  const at = new Date(iso).getTime();

  if (Number.isNaN(at)) return null;

  const days = daysSince(iso, now);

  return days === 0 ? "Under a day" : plural(days, "day");
}

/** Whether a timestamp is before `now`, such as a task's due time. */
export function isPast(iso: string, now = Date.now()) {
  return iso < new Date(now).toISOString();
}

/** Whether a timestamp is after `now`, such as an upcoming meeting. */
export function isFuture(iso: string, now = Date.now()) {
  return iso > new Date(now).toISOString();
}

/** "3 contacts", "1 deal". */
export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
