import { createId, ID_PREFIXES } from "@crm/core/ids";
import { type DealBase, type FetchedRates, type RateQuote } from "@crm/core/money";
import { DEAL_STAGES, REPORTING_CURRENCY } from "@crm/core/records";
import type { Pool, PoolClient } from "pg";

/** An open deal's amount and what it stores in the reporting currency now. */
export interface DealAmount {
  readonly id: string;
  readonly amount: string | null;
  readonly currency: string;
  readonly base: DealBase;
}

/** Reads and writes for reporting currency and rates, inside one transaction. */
export interface MoneyTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  /** The workspace's reporting currency; USD until someone saves another. */
  reportingCurrency(workspaceId: string): Promise<string>;
  setReportingCurrency(workspaceId: string, currency: string): Promise<void>;
  /** Every fetched rate, plus the workspace's manual ones. */
  rates(workspaceId: string): Promise<RateQuote[]>;
  /** Sets the workspace's own rate for a pair (one row per pair), dated `asOf`. */
  setManualRate(
    workspaceId: string,
    rate: { base: string; quote: string; rate: string; asOf: string },
  ): Promise<void>;
  /** Removes the workspace's own rates between two currencies, in either direction. */
  clearManualRate(workspaceId: string, first: string, second: string): Promise<boolean>;
  /** The workspace's deals in an open stage. */
  openDeals(workspaceId: string): Promise<DealAmount[]>;
  setDealBase(workspaceId: string, id: string, base: DealBase): Promise<void>;
}

export interface MoneyStore {
  /** Runs `fn` in one transaction and returns its result with that transaction's id. */
  transact<A>(fn: (tx: MoneyTx) => Promise<A>): Promise<{ result: A; txid: number }>;
  /** What converting a deal needs, read outside any transaction. */
  quotesFor(workspaceId: string): Promise<{ reporting: string; quotes: RateQuote[] }>;
  /** Stores one day of fetched rates (replacing that day's) and drops fetched days past 30. */
  saveFetched(rates: FetchedRates): Promise<void>;
  /** Workspaces with at least one open deal that has an amount. */
  workspacesWithOpenDeals(): Promise<string[]>;
}

const OPEN_STAGES = DEAL_STAGES.filter((stage) => stage.open).map((stage) => stage.id);

/** pg returns `numeric` as text and `date` as a local Date, so dates are read as text. */
interface RateRow {
  base: string;
  quote: string;
  rate: string;
  as_of: string;
  source: string;
}

interface DealRow {
  id: string;
  amount: string | null;
  currency: string;
  base_amount: string | null;
  base_currency: string | null;
  fx_rate: string | null;
  fx_rate_at: Date | null;
}

const RATE_COLUMNS = "base, quote, rate::text AS rate, as_of::text AS as_of, source";

const toQuote = (row: RateRow): RateQuote => ({
  base: row.base,
  quote: row.quote,
  rate: row.rate,
  asOf: row.as_of,
  source: row.source,
});

type Queryable = Pick<PoolClient, "query">;

async function readQuotes(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<RateRow>(
    `SELECT ${RATE_COLUMNS} FROM exchange_rate WHERE workspace_id IS NULL OR workspace_id = $1`,
    [workspaceId],
  );

  return rows.map(toQuote);
}

async function readReporting(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<{ reporting_currency: string }>(
    "SELECT reporting_currency FROM workspace_setting WHERE workspace_id = $1",
    [workspaceId],
  );

  return rows[0]?.reporting_currency ?? REPORTING_CURRENCY;
}

function moneyTx(client: PoolClient): MoneyTx {
  return {
    isMember: async (workspaceId, userId) =>
      (
        await client.query('SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = $2', [
          workspaceId,
          userId,
        ])
      ).rowCount === 1,
    reportingCurrency: (workspaceId) => readReporting(client, workspaceId),
    setReportingCurrency: async (workspaceId, currency) => {
      // Only this column: the row also holds the tracking key, which another screen owns.
      await client.query(
        `INSERT INTO workspace_setting (workspace_id, reporting_currency, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (workspace_id)
         DO UPDATE SET reporting_currency = EXCLUDED.reporting_currency, updated_at = now()`,
        [workspaceId, currency],
      );
    },
    rates: (workspaceId) => readQuotes(client, workspaceId),
    setManualRate: async (workspaceId, rate) => {
      const updated = await client.query(
        `UPDATE exchange_rate SET rate = $4, as_of = $5, created_at = now()
         WHERE workspace_id = $1 AND base = $2 AND quote = $3 AND source = 'manual'`,
        [workspaceId, rate.base, rate.quote, rate.rate, rate.asOf],
      );

      if (updated.rowCount === 0) {
        await client.query(
          `INSERT INTO exchange_rate (id, base, quote, rate, as_of, source, workspace_id)
           VALUES ($1, $2, $3, $4, $5, 'manual', $6)`,
          [
            createId(ID_PREFIXES.exchange_rate),
            rate.base,
            rate.quote,
            rate.rate,
            rate.asOf,
            workspaceId,
          ],
        );
      }
    },
    clearManualRate: async (workspaceId, first, second) =>
      ((
        await client.query(
          `DELETE FROM exchange_rate
           WHERE workspace_id = $1 AND source = 'manual'
             AND ((base = $2 AND quote = $3) OR (base = $3 AND quote = $2))`,
          [workspaceId, first, second],
        )
      ).rowCount ?? 0) > 0,
    openDeals: async (workspaceId) => {
      const { rows } = await client.query<DealRow>(
        `SELECT id, amount::text AS amount, currency, base_amount::text AS base_amount,
                base_currency, fx_rate::text AS fx_rate, fx_rate_at
         FROM deal WHERE workspace_id = $1 AND stage = ANY($2)`,
        [workspaceId, OPEN_STAGES],
      );

      return rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        base: {
          baseAmount: row.base_amount,
          baseCurrency: row.base_currency,
          fxRate: row.fx_rate,
          fxRateAt: row.fx_rate_at,
        },
      }));
    },
    setDealBase: async (workspaceId, id, base) => {
      await client.query(
        `UPDATE deal SET base_amount = $3, base_currency = $4, fx_rate = $5, fx_rate_at = $6
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, id, base.baseAmount, base.baseCurrency, base.fxRate, base.fxRateAt],
      );
    },
  };
}

/** The Postgres store, on the shared pool; each transaction reads `pg_current_xact_id()`. */
export function pgMoneyStore(pool: Pool): MoneyStore {
  return {
    transact: async (fn) => {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const result = await fn(moneyTx(client));

        const { rows } = await client.query<{ txid: string }>(
          "SELECT pg_current_xact_id()::xid::text AS txid",
        );

        await client.query("COMMIT");

        const txid = Number(rows[0]?.txid);

        if (!Number.isSafeInteger(txid)) throw new Error("Unexpected transaction id");

        return { result, txid };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);

        throw error;
      } finally {
        client.release();
      }
    },
    quotesFor: async (workspaceId) => {
      const [reporting, quotes] = await Promise.all([
        readReporting(pool, workspaceId),
        readQuotes(pool, workspaceId),
      ]);

      return { reporting, quotes };
    },
    saveFetched: async (fetched) => {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        for (const [quote, rate] of fetched.rates) {
          // Fetched rows share a NULL workspace, which a unique key can't see: replace the day's.
          // oxlint-disable-next-line no-await-in-loop -- ten rows in one transaction.
          await client.query(
            `DELETE FROM exchange_rate
             WHERE source = 'fetched' AND workspace_id IS NULL AND base = $1 AND quote = $2 AND as_of = $3`,
            [fetched.base, quote, fetched.asOf],
          );
          // oxlint-disable-next-line no-await-in-loop -- as above.
          await client.query(
            `INSERT INTO exchange_rate (id, base, quote, rate, as_of, source, workspace_id)
             VALUES ($1, $2, $3, $4, $5, 'fetched', NULL)`,
            [createId(ID_PREFIXES.exchange_rate), fetched.base, quote, String(rate), fetched.asOf],
          );
        }

        await client.query(
          "DELETE FROM exchange_rate WHERE source = 'fetched' AND as_of < ($1::date - 30)",
          [fetched.asOf],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);

        throw error;
      } finally {
        client.release();
      }
    },
    workspacesWithOpenDeals: async () =>
      (
        await pool.query<{ workspace_id: string }>(
          "SELECT DISTINCT workspace_id FROM deal WHERE amount IS NOT NULL AND stage = ANY($1)",
          [OPEN_STAGES],
        )
      ).rows.map((row) => row.workspace_id),
  };
}
