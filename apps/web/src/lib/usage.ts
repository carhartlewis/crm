import { USAGE_COSTS_SYNC_PATH, USAGE_SYNC_PATH } from "@crm/core/api";
import {
  isUsageOrigin,
  USAGE_ORIGIN_LABELS,
  usageJobLabel,
  usageMonthOf,
  usageMonthRange,
} from "@crm/core/usage";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection, useLiveQuery } from "@tanstack/react-db";
import { workspaceSettingsCollection } from "./money.ts";
import { isoTimestamp, perWorkspace } from "./sync-collections.ts";

/**
 * What a workspace's paid lookups cost (ADR 0027), live: the ledger syncs through Electric, so
 * the Usage page and a record's spend change as lookups run. Only owners and admins receive what
 * each lookup cost us (a second shape).
 */

/** One paid lookup as the usage shape syncs it. */
export type UsageEvent = {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string | null;
  readonly origin: string;
  readonly contract: string;
  readonly outcome: string;
  readonly price_micro: number;
  readonly record_kind: string | null;
  readonly record_id: string | null;
  readonly created_at: string;
};

/** What one lookup cost us; synced to owners and admins only. */
export type UsageCost = {
  readonly id: string;
  readonly workspace_id: string;
  readonly cost_micro: number;
};

const syncFrom = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

export const usageCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<UsageEvent>({
      id: `usage:${workspaceId}`,
      getKey: (event) => event.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncFrom(USAGE_SYNC_PATH, workspaceId),
    }),
  ),
);

export const usageCostsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<UsageCost>({
      id: `usage-costs:${workspaceId}`,
      getKey: (cost) => cost.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncFrom(USAGE_COSTS_SYNC_PATH, workspaceId),
    }),
  ),
);

/** Starts the three syncs the Usage page reads; route loaders await it. */
export function preloadUsage(workspaceId: string) {
  return Promise.all([
    usageCollection(workspaceId).preload(),
    usageCostsCollection(workspaceId).preload(),
    workspaceSettingsCollection(workspaceId).preload(),
  ]);
}

export interface UsageLine {
  readonly key: string;
  readonly label: string;
  readonly calls: number;
  readonly priceMicro: number;
  /** What the calls cost us; null for members, who don't receive it. */
  readonly costMicro: number | null;
}

export interface UsageReport {
  readonly month: string;
  readonly calls: number;
  readonly priceMicro: number;
  readonly costMicro: number | null;
  /** Price per day of the month, every day present (0 when nothing ran). */
  readonly days: readonly { readonly day: string; readonly priceMicro: number }[];
  readonly origins: readonly UsageLine[];
  readonly members: readonly UsageLine[];
  readonly jobs: readonly UsageLine[];
}

/** Biggest spend first. */
const byPrice = (left: UsageLine, right: UsageLine) => right.priceMicro - left.priceMicro;

/**
 * One month's usage from the synced ledger: totals, every day of the month, and lines by what ran
 * the lookups, by member and by job. `costs` is empty for members, and then costs stay null.
 */
export function usageReport(
  events: readonly UsageEvent[],
  costs: ReadonlyMap<string, number>,
  month: string,
  memberName: (userId: string | null) => string,
): UsageReport {
  const inMonth = events.filter((event) => usageMonthOf(new Date(event.created_at)) === month);
  const known = costs.size > 0;
  const costOf = (event: UsageEvent) => costs.get(event.id) ?? 0;

  const lines = (keyOf: (event: UsageEvent) => string, labelOf: (key: string) => string) => {
    const groups = Map.groupBy(inMonth, keyOf);

    return [...groups]
      .map(([key, group]) => ({
        key,
        label: labelOf(key),
        calls: group.length,
        priceMicro: group.reduce((sum, event) => sum + event.price_micro, 0),
        costMicro: known ? group.reduce((sum, event) => sum + costOf(event), 0) : null,
      }))
      .toSorted(byPrice);
  };

  const { start, end } = usageMonthRange(month);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const perDay = Map.groupBy(inMonth, (event) => event.created_at.slice(0, 10));

  return {
    month,
    calls: inMonth.length,
    priceMicro: inMonth.reduce((sum, event) => sum + event.price_micro, 0),
    costMicro: known ? inMonth.reduce((sum, event) => sum + costOf(event), 0) : null,
    days: Array.from({ length: dayCount }, (_, index) => {
      const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);

      return {
        day,
        priceMicro: (perDay.get(day) ?? []).reduce((sum, event) => sum + event.price_micro, 0),
      };
    }),
    origins: lines(
      (event) => event.origin,
      (key) => (isUsageOrigin(key) ? USAGE_ORIGIN_LABELS[key] : key),
    ),
    members: lines(
      (event) => event.user_id ?? "",
      (key) => memberName(key || null),
    ),
    jobs: lines((event) => event.contract, usageJobLabel),
  };
}

/** The months the ledger has lookups in, newest first, always with `current`. */
export function usageMonths(events: readonly UsageEvent[], current: string) {
  const months = new Set([
    current,
    ...events.map((event) => usageMonthOf(new Date(event.created_at))),
  ]);

  return [...months].toSorted().toReversed();
}

/** The workspace's synced ledger, what each lookup cost us (admins only), and its markup. */
export function useUsage(workspaceId: string) {
  const events =
    useLiveQuery({ query: (q) => q.from({ event: usageCollection(workspaceId) }) }).data ?? [];

  const costRows =
    useLiveQuery({ query: (q) => q.from({ cost: usageCostsCollection(workspaceId) }) }).data ?? [];

  const settings =
    useLiveQuery({ query: (q) => q.from({ setting: workspaceSettingsCollection(workspaceId) }) })
      .data ?? [];

  return {
    events,
    costs: new Map(costRows.map((row) => [row.id, row.cost_micro])),
    markupBps: settings[0]?.usage_markup_bps ?? 0,
  };
}

/** What research and lookups on one record have cost, live. */
export function useRecordSpend(workspaceId: string, recordId: string) {
  const events =
    useLiveQuery({ query: (q) => q.from({ event: usageCollection(workspaceId) }) }).data ?? [];

  const mine = events.filter((event) => event.record_id === recordId);

  return {
    calls: mine.length,
    priceMicro: mine.reduce((sum, event) => sum + event.price_micro, 0),
  };
}
