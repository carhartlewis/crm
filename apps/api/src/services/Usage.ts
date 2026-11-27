import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import {
  isUsageMonth,
  isUsageOrigin,
  USAGE_ORIGIN_LABELS,
  usageDollars,
  usageJobLabel,
  usageMonthOf,
  usageMonthRange,
} from "@crm/core/usage";
import { Context, Effect, Layer } from "effect";
import type { Pool } from "pg";
import { Postgres } from "./Postgres.ts";

/**
 * What a workspace's paid calls cost (ADR 0027), from the `usage_event` ledger: the Usage page,
 * a record's Agent tab and the CSV export members bill from. Members see prices; admins also see
 * what the calls cost us.
 */

export interface UsageActor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

export interface UsageLine {
  readonly key: string;
  readonly label: string;
  readonly calls: number;
  readonly priceMicro: number;
  readonly costMicro: number | null;
}

export interface UsageSummary {
  readonly month: string;
  readonly currentMonth: string;
  readonly calls: number;
  readonly priceMicro: number;
  readonly costMicro: number | null;
  readonly markupBps: number;
  readonly days: readonly { readonly day: string; readonly priceMicro: number }[];
  readonly members: readonly UsageLine[];
  readonly origins: readonly UsageLine[];
  readonly jobs: readonly UsageLine[];
}

/** One ledger row as the export lists it. */
export interface UsageExportRow {
  readonly createdAt: Date;
  readonly member: string;
  readonly origin: string;
  readonly contract: string;
  readonly outcome: string;
  readonly recordKind: string | null;
  readonly recordId: string | null;
  readonly priceMicro: number;
  readonly costMicro: number;
}

interface Grouped {
  readonly key: string;
  readonly label: string | null;
  readonly calls: number;
  readonly price: number;
  readonly cost: number;
}

/** The SQL a summary needs; Postgres in the app, a fake in tests. */
export interface UsageStore {
  /** The member's role in the workspace (`owner`, `admin`, `member`); null when not a member. */
  role(workspaceId: string, userId: string): Promise<string | null>;
  markupBps(workspaceId: string): Promise<number>;
  grouped(
    workspaceId: string,
    range: { start: Date; end: Date },
    by: "day" | "member" | "origin" | "job",
  ): Promise<readonly Grouped[]>;
  rows(workspaceId: string, range: { start: Date; end: Date }): Promise<readonly UsageExportRow[]>;
  record(workspaceId: string, recordId: string): Promise<{ calls: number; price: number }>;
}

type Failure = NotFound | NoActiveWorkspace | Invalid;

export interface UsageService {
  readonly summary: (
    actor: UsageActor,
    month: string | undefined,
  ) => Effect.Effect<UsageSummary, Failure>;
  readonly record: (
    actor: UsageActor,
    recordId: string,
  ) => Effect.Effect<{ calls: number; priceMicro: number }, Failure>;
  /** The month as CSV text, one row per call. */
  readonly exportCsv: (
    actor: UsageActor,
    month: string | undefined,
  ) => Effect.Effect<string, Failure>;
}

const isAdmin = (role: string | null) => role === "owner" || role === "admin";

/** Biggest spend first. */
const byPrice = (left: UsageLine, right: UsageLine) => right.priceMicro - left.priceMicro;

/** One CSV field: quoted when it holds a comma, quote or line break. */
function csvField(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function makeUsage(store: UsageStore, now: () => Date = () => new Date()): UsageService {
  /** The workspace and the caller's role, or why there is none. */
  const scope = (actor: UsageActor, month: string | undefined) =>
    Effect.gen(function* () {
      const workspaceId = actor.activeWorkspaceId;

      if (!workspaceId) return yield* new NoActiveWorkspace({ message: "Choose a workspace" });

      const chosen = month ?? usageMonthOf(now());

      if (!isUsageMonth(chosen)) return yield* new Invalid({ message: "Give a month as YYYY-MM" });

      const role = yield* Effect.promise(() => store.role(workspaceId, actor.userId));

      if (role === null) return yield* new NotFound({ message: "Workspace not found" });

      return { workspaceId, month: chosen, range: usageMonthRange(chosen), admin: isAdmin(role) };
    });

  return {
    summary: (actor, month) =>
      Effect.gen(function* () {
        const { workspaceId, month: chosen, range, admin } = yield* scope(actor, month);

        const [days, members, origins, jobs, markupBps] = yield* Effect.promise(() =>
          Promise.all([
            store.grouped(workspaceId, range, "day"),
            store.grouped(workspaceId, range, "member"),
            store.grouped(workspaceId, range, "origin"),
            store.grouped(workspaceId, range, "job"),
            store.markupBps(workspaceId),
          ]),
        );

        const line = (row: Grouped, label: string): UsageLine => ({
          key: row.key,
          label,
          calls: row.calls,
          priceMicro: row.price,
          costMicro: admin ? row.cost : null,
        });

        return {
          month: chosen,
          currentMonth: usageMonthOf(now()),
          calls: days.reduce((sum, row) => sum + row.calls, 0),
          priceMicro: days.reduce((sum, row) => sum + row.price, 0),
          costMicro: admin ? days.reduce((sum, row) => sum + row.cost, 0) : null,
          markupBps,
          days: days.map((row) => ({ day: row.key, priceMicro: row.price })),
          members: members.map((row) => line(row, row.label ?? "Former member")).toSorted(byPrice),
          origins: origins
            .map((row) =>
              line(row, isUsageOrigin(row.key) ? USAGE_ORIGIN_LABELS[row.key] : row.key),
            )
            .toSorted(byPrice),
          jobs: jobs.map((row) => line(row, usageJobLabel(row.key))).toSorted(byPrice),
        };
      }),

    record: (actor, recordId) =>
      Effect.gen(function* () {
        const { workspaceId } = yield* scope(actor, undefined);
        const total = yield* Effect.promise(() => store.record(workspaceId, recordId));

        return { calls: total.calls, priceMicro: total.price };
      }),

    exportCsv: (actor, month) =>
      Effect.gen(function* () {
        const { workspaceId, range, admin } = yield* scope(actor, month);
        const rows = yield* Effect.promise(() => store.rows(workspaceId, range));

        const header = [
          "date",
          "member",
          "origin",
          "job",
          "outcome",
          "record_kind",
          "record_id",
          "price_usd",
          ...(admin ? ["cost_usd"] : []),
        ];

        const lines = rows.map((row) =>
          [
            row.createdAt.toISOString(),
            row.member,
            row.origin,
            row.contract,
            row.outcome,
            row.recordKind ?? "",
            row.recordId ?? "",
            usageDollars(row.priceMicro),
            ...(admin ? [usageDollars(row.costMicro)] : []),
          ]
            .map(csvField)
            .join(","),
        );

        return `${[header.join(","), ...lines].join("\n")}\n`;
      }),
  };
}

const GROUP_SQL: Record<
  "day" | "member" | "origin" | "job",
  { key: string; label: string; join: string }
> = {
  day: { key: `to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, label: "NULL", join: "" },
  member: {
    key: "coalesce(e.user_id, '')",
    label: "min(u.name)",
    join: 'LEFT JOIN "user" u ON u.id = e.user_id',
  },
  origin: { key: "e.origin", label: "NULL", join: "" },
  job: { key: "e.contract", label: "NULL", join: "" },
};

export function pgUsageReports(pool: Pool): UsageStore {
  return {
    role: async (workspaceId, userId) => {
      const result = await pool.query<{ role: string }>(
        'SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
        [workspaceId, userId],
      );

      return result.rows[0]?.role ?? null;
    },
    markupBps: async (workspaceId) => {
      const result = await pool.query<{ usage_markup_bps: number }>(
        "SELECT usage_markup_bps FROM workspace_setting WHERE workspace_id = $1",
        [workspaceId],
      );

      return result.rows[0]?.usage_markup_bps ?? 0;
    },
    grouped: async (workspaceId, { start, end }, by) => {
      const group = GROUP_SQL[by];

      const result = await pool.query<{
        key: string;
        label: string | null;
        calls: string;
        price: string;
        cost: string;
      }>(
        `SELECT ${group.key} AS key, ${group.label} AS label, count(*) AS calls,
                coalesce(sum(e.price_micro), 0) AS price, coalesce(sum(e.cost_micro), 0) AS cost
           FROM usage_event e ${group.join}
          WHERE e.workspace_id = $1 AND e.created_at >= $2 AND e.created_at < $3
          GROUP BY 1
          ORDER BY 1`,
        [workspaceId, start, end],
      );

      return result.rows.map((row) => ({
        key: row.key,
        label: row.label,
        calls: Number(row.calls),
        price: Number(row.price),
        cost: Number(row.cost),
      }));
    },
    rows: async (workspaceId, { start, end }) => {
      const result = await pool.query<{
        created_at: Date;
        member: string | null;
        origin: string;
        contract: string;
        outcome: string;
        record_kind: string | null;
        record_id: string | null;
        price_micro: number;
        cost_micro: number;
      }>(
        `SELECT e.created_at, u.name AS member, e.origin, e.contract, e.outcome, e.record_kind,
                e.record_id, e.price_micro, e.cost_micro
           FROM usage_event e LEFT JOIN "user" u ON u.id = e.user_id
          WHERE e.workspace_id = $1 AND e.created_at >= $2 AND e.created_at < $3
          ORDER BY e.created_at`,
        [workspaceId, start, end],
      );

      return result.rows.map((row) => ({
        createdAt: row.created_at,
        member: row.member ?? "Former member",
        origin: row.origin,
        contract: row.contract,
        outcome: row.outcome,
        recordKind: row.record_kind,
        recordId: row.record_id,
        priceMicro: row.price_micro,
        costMicro: row.cost_micro,
      }));
    },
    record: async (workspaceId, recordId) => {
      const result = await pool.query<{ calls: string; price: string }>(
        `SELECT count(*) AS calls, coalesce(sum(price_micro), 0) AS price
           FROM usage_event WHERE workspace_id = $1 AND record_id = $2`,
        [workspaceId, recordId],
      );

      return {
        calls: Number(result.rows[0]?.calls ?? 0),
        price: Number(result.rows[0]?.price ?? 0),
      };
    },
  };
}

export class Usage extends Context.Service<Usage, UsageService>()("@crm/api/services/Usage") {
  static readonly layer = Layer.effect(
    Usage,
    Effect.gen(function* () {
      return makeUsage(pgUsageReports(yield* Postgres));
    }),
  ).pipe(Layer.provide(Postgres.layer));
}
