/**
 * Calendar dates ("2026-11-26") and local date-times ("2026-11-26T09:30"), the same strings the
 * API stores and native date inputs used. Parsing and formatting stay in local time, so a date
 * never shifts a day across time zones.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;
const TIME = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?m?\.?$/i;

const pad = (value: number) => String(value).padStart(2, "0");

/** The local Date for a calendar date, or undefined when it isn't one. */
export function parseCalendarDate(value: string | null | undefined) {
  const match = DATE.exec(value ?? "");

  if (!match) return undefined;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);

  // Rejects dates that roll over, such as 2026-02-31.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function formatCalendarDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface TimeOfDay {
  readonly hours: number;
  readonly minutes: number;
}

/** Typed times: "9", "9am", "9:30", "930", "9:30 pm", "21:30". Null when it isn't a time. */
export function parseTime(text: string): TimeOfDay | null {
  const match = TIME.exec(text.trim());

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();

  if (minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;

    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }

  return { hours, minutes };
}

/** A local date-time's date and time, or undefined when it isn't one. */
export function parseDateTime(value: string | null | undefined) {
  const match = DATE_TIME.exec(value ?? "");
  const date = parseCalendarDate(match?.[1]);

  if (!match || !date) return undefined;

  return { date, time: { hours: Number(match[2]), minutes: Number(match[3]) } };
}

export function formatDateTime(date: Date, time: TimeOfDay) {
  return `${formatCalendarDate(date)}T${pad(time.hours)}:${pad(time.minutes)}`;
}
