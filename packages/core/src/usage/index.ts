/**
 * Usage and billing (ADR 0027), client-safe. Every paid call is one `usage_event` row for its
 * workspace: `cost_micro` is what the provider charged, `price_micro` what the workspace pays.
 * Both are integers in micro-USD (one millionth of a dollar), so sums never drift.
 */

export const MICRO_PER_DOLLAR = 1_000_000;

/** What ran a paid call. */
export const USAGE_ORIGINS = ["chat", "research", "sheet"] as const;

export type UsageOrigin = (typeof USAGE_ORIGINS)[number];

const USAGE_ORIGIN_SET = new Set<string>(USAGE_ORIGINS);

export function isUsageOrigin(value: string): value is UsageOrigin {
  return USAGE_ORIGIN_SET.has(value);
}

export const USAGE_ORIGIN_LABELS: Record<UsageOrigin, string> = {
  chat: "Chats",
  research: "Research on new records",
  sheet: "Record actions",
};

/** `hit` found something, `miss` found nothing (free), `cached` was answered from our cache. */
export const USAGE_OUTCOMES = ["hit", "miss", "error", "cached"] as const;

export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

/** The most markup a workspace can have: 10× cost. */
export const MAX_MARKUP_BPS = 100_000;

/**
 * What the workspace pays for a call that cost `costMicro`, with `markupBps` on top (100 bps is
 * 1%). Rounded up to whole micro-dollars, so a priced call never rounds to free.
 */
export function priceFor(costMicro: number, markupBps: number) {
  const cost = Math.max(0, Math.round(costMicro));
  const markup = Math.min(MAX_MARKUP_BPS, Math.max(0, Math.round(markupBps)));

  return Math.ceil((cost * (10_000 + markup)) / 10_000);
}

/**
 * A price for people: "Free" for nothing, "<$0.01" under a cent, then dollars to two places
 * ("$0.24", "$12.80"). Larger sums drop the cents ("$1,240").
 */
export function formatUsage(micro: number) {
  if (micro <= 0) return "Free";

  if (micro < 10_000) return "<$0.01";

  const dollars = micro / MICRO_PER_DOLLAR;

  return dollars >= 1000
    ? `$${Math.round(dollars).toLocaleString("en-US")}`
    : `$${dollars.toFixed(2)}`;
}

/** Exact dollars for a CSV export: six decimal places, no symbol. */
export function usageDollars(micro: number) {
  return (micro / MICRO_PER_DOLLAR).toFixed(6);
}

/** A billing month, `YYYY-MM`. */
export function isUsageMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;

  const year = Number(value.slice(0, 4));

  return year >= 2000 && year <= 9999;
}

/** The month a date falls in, in UTC. */
export function usageMonthOf(date: Date) {
  return date.toISOString().slice(0, 7);
}

/** The first instant of `month` and of the month after it, in UTC: `[start, end)`. */
export function usageMonthRange(month: string) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;

  return {
    start: new Date(Date.UTC(year, index, 1)),
    end: new Date(Date.UTC(year, index + 1, 1)),
  };
}

/** A call's usage as the CRM tools report it with their answer, for the chat to show. */
export interface CallUsage {
  readonly usageId: string | null;
  readonly priceMicro: number;
  readonly outcome: UsageOutcome;
}

/** Sums the prices of calls; one place, so a turn and a chat add up the same way. */
export function totalUsage(calls: readonly Pick<CallUsage, "priceMicro">[]) {
  return calls.reduce((sum, call) => sum + Math.max(0, call.priceMicro), 0);
}

/** How a call's price reads next to it: its price, or why it was free. */
export function callUsageLabel(usage: Pick<CallUsage, "priceMicro" | "outcome">) {
  if (usage.outcome === "cached") return "Saved";

  if (usage.outcome === "miss" || usage.outcome === "error") return "No charge";

  return formatUsage(usage.priceMicro);
}

/** Each enrichment job in members' words, for the Usage page and the export. */
const USAGE_JOB_LABELS = new Map<string, string>([
  ["people.search", "Find people"],
  ["people.email.find", "Find email"],
  ["people.email.verify", "Verify email"],
  ["people.phone.find", "Find phone"],
  ["people.enrich", "Look up person"],
  ["linkedin.user.profile", "Read LinkedIn profile"],
  ["companies.enrich", "Look up company"],
  ["companies.search", "Find companies"],
  ["companies.similar", "Similar companies"],
]);

export const usageJobLabel = (contract: string) => USAGE_JOB_LABELS.get(contract) ?? contract;

/** The last `count` billing months, newest first, ending with the month `now` falls in. */
export function recentUsageMonths(now: Date, count = 12) {
  return Array.from({ length: count }, (_, index) =>
    usageMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))),
  );
}

/** "November 2026". */
export function usageMonthLabel(month: string) {
  return usageMonthRange(month).start.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
