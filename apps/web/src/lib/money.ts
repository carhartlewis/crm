import { EXCHANGE_RATES_SYNC_PATH, WORKSPACE_SETTINGS_SYNC_PATH } from "@crm/core/api";
import { type RateQuote, resolveRate } from "@crm/core/money";
import { CURRENCIES, REPORTING_CURRENCY } from "@crm/core/records";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection, useLiveQuery } from "@tanstack/react-db";
import { mutationOptions } from "@tanstack/react-query";
import { isoTimestamp, perWorkspace, syncedWrite } from "./sync-collections.ts";

/**
 * Reporting currency and exchange rates, synced (ADR 0024). Totals add each deal's base amount,
 * which the API stores in the reporting currency; these rows show the rates behind it.
 */

/** The workspace's settings row as Electric syncs it (made on first save). */
export type WorkspaceSetting = {
  readonly workspace_id: string;
  readonly reporting_currency: string;
  readonly updated_at: string;
};

/** An exchange rate row: one `base` is `rate` (decimal text) units of `quote` on `as_of`. */
export type ExchangeRate = {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
  readonly as_of: string;
  readonly source: string;
  readonly workspace_id: string | null;
  readonly created_at: string;
};

const syncFrom = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

const saveSetting = async (row: WorkspaceSetting) =>
  (
    await syncedWrite("/api/workspace-settings", "PUT", {
      reporting_currency: row.reporting_currency,
    })
  ).txid;

/** The settings row; a change shows at once and settles when its txid comes back. */
export const workspaceSettingsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<WorkspaceSetting>({
      id: `workspace-settings:${workspaceId}`,
      getKey: (row) => row.workspace_id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncFrom(WORKSPACE_SETTINGS_SYNC_PATH, workspaceId),
      onInsert: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ modified }) => saveSetting(modified)),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
      onUpdate: async ({ transaction, collection }) => {
        const txids = await Promise.all(
          transaction.mutations.map(({ modified }) => saveSetting(modified)),
        );

        await Promise.all(txids.map((txid) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

/** Fetched rates every workspace shares, plus this workspace's own. Read-only here. */
export const exchangeRatesCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<ExchangeRate>({
      id: `exchange-rates:${workspaceId}`,
      getKey: (row) => row.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncFrom(EXCHANGE_RATES_SYNC_PATH, workspaceId),
    }),
  ),
);

/** The workspace's reporting currency; USD until someone picks another. */
export function useReportingCurrency(workspaceId: string) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ setting: workspaceSettingsCollection(workspaceId) }),
  });

  return data[0]?.reporting_currency ?? REPORTING_CURRENCY;
}

export function useExchangeRates(workspaceId: string) {
  const { data = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ rate: exchangeRatesCollection(workspaceId) }),
  });

  return { rates: data, loading: isLoading };
}

export const toQuote = (row: ExchangeRate): RateQuote => ({
  base: row.base,
  quote: row.quote,
  rate: row.rate,
  asOf: row.as_of,
  source: row.source,
});

/** One line of the rates table: a currency's rate into the reporting currency. */
export interface CurrencyRate {
  readonly code: string;
  readonly name: string;
  /** Reporting-currency units per one unit of `code`; `null` when no rate connects them. */
  readonly rate: number | null;
  readonly asOf: string | null;
  readonly manual: boolean;
}

/** Every other supported currency with its current rate into `reporting`. */
export function currencyRates(rows: readonly ExchangeRate[], reporting: string): CurrencyRate[] {
  const quotes = rows.map(toQuote);

  return CURRENCIES.filter((currency) => currency.code !== reporting).map((currency) => {
    const resolved = resolveRate(quotes, currency.code, reporting);

    return {
      code: currency.code,
      name: currency.name,
      rate: resolved?.rate ?? null,
      asOf: resolved?.asOf ?? null,
      manual: resolved?.source === "manual",
    };
  });
}

/** Saves the reporting currency; open deals are converted again on the server. */
export const saveReportingCurrencyMutation = mutationOptions({
  mutationKey: ["workspace-settings", "save"],
  mutationFn: async (args: { workspaceId: string; currency: string }) => {
    const collection = workspaceSettingsCollection(args.workspaceId);
    const current = collection.get(args.workspaceId);

    const transaction = current
      ? collection.update(args.workspaceId, (draft) => {
          draft.reporting_currency = args.currency;
        })
      : collection.insert({
          workspace_id: args.workspaceId,
          reporting_currency: args.currency,
          updated_at: new Date().toISOString(),
        });

    await transaction.when("settled");
  },
});

const manualPath = (currency: string) =>
  `/api/exchange-rates/manual/${encodeURIComponent(currency)}`;

/** Sets the workspace's own rate for a currency; settles once the rate row has synced. */
export const setManualRateMutation = mutationOptions({
  mutationKey: ["exchange-rates", "manual"],
  mutationFn: async (args: { workspaceId: string; currency: string; rate: string }) => {
    const { txid } = await syncedWrite(manualPath(args.currency), "PUT", { rate: args.rate });

    await exchangeRatesCollection(args.workspaceId).utils.awaitTxId(txid);
  },
});

/** Goes back to the fetched rate for a currency. */
export const clearManualRateMutation = mutationOptions({
  mutationKey: ["exchange-rates", "clear"],
  mutationFn: async (args: { workspaceId: string; currency: string }) => {
    const { txid } = await syncedWrite(manualPath(args.currency), "DELETE");

    await exchangeRatesCollection(args.workspaceId).utils.awaitTxId(txid);
  },
});

/** "2 not counted (no EUR rate)": the deals a total leaves out, and why. */
export function notCountedNote(summary: { notCounted: number; missing: readonly string[] }) {
  if (summary.notCounted === 0) return null;

  const rates = summary.missing.length === 1 ? "rate" : "rates";

  return `${summary.notCounted} not counted (no ${summary.missing.join(", ")} ${rates})`;
}
