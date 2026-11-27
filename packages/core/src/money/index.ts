/**
 * Exchange rates and conversion to a workspace's reporting currency (ADR 0024). Pure and
 * client-safe: the API uses it to store each deal's base amount, and the web app to show rates
 * and totals from the synced `exchange_rate` rows.
 *
 * A rate row reads "one `base` is `rate` units of `quote`". Fetched rows are shared by every
 * workspace; a manual row belongs to one workspace and wins over fetched ones for its pair.
 */

import { Schema } from "effect";
import { CURRENCIES, type FieldResult, isCurrency } from "../records/index.ts";

export type RateSource = "fetched" | "manual";

/** One exchange rate as both the API and the synced rows can give it. */
export interface RateQuote {
  readonly base: string;
  readonly quote: string;
  /** Decimal text (Postgres numeric) or a number. */
  readonly rate: string | number;
  /** The day the rate is for, `YYYY-MM-DD`. */
  readonly asOf: string;
  readonly source: string;
}

/** The multiplier that turns an amount in one currency into another, and where it came from. */
export interface ResolvedRate {
  readonly rate: number;
  /** The day of the rate used; `null` for the same currency. */
  readonly asOf: string | null;
  readonly source: RateSource | "identity" | "cross";
}

const positive = (value: string | number) => {
  const rate = Number(value);

  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

/** The latest usable quote for a pair in either direction, as a from→to multiplier. */
function pairRate(
  quotes: readonly RateQuote[],
  from: string,
  to: string,
  source: RateSource,
): ResolvedRate | null {
  let best: { rate: number; asOf: string } | null = null;

  for (const quote of quotes) {
    if (quote.source !== source) continue;

    const rate = positive(quote.rate);

    if (rate === null) continue;

    let multiplier: number | null = null;

    if (quote.base === from && quote.quote === to) multiplier = rate;
    else if (quote.base === to && quote.quote === from) multiplier = 1 / rate;

    if (multiplier !== null && (!best || quote.asOf > best.asOf)) {
      best = { rate: multiplier, asOf: quote.asOf };
    }
  }

  return best ? { ...best, source } : null;
}

/** The latest fetched quote of each `base → quote` pair. */
function latestFetched(quotes: readonly RateQuote[]) {
  const latest = new Map<string, { rate: number; asOf: string }>();

  for (const quote of quotes) {
    if (quote.source !== "fetched") continue;

    const rate = positive(quote.rate);
    const key = `${quote.base}:${quote.quote}`;
    const seen = latest.get(key);

    if (rate !== null && (!seen || quote.asOf > seen.asOf)) {
      latest.set(key, { rate, asOf: quote.asOf });
    }
  }

  return latest;
}

/**
 * The rate that converts `from` into `to`: the same currency is 1; otherwise a manual rate for
 * the pair (either direction, latest day), then a fetched one, then fetched rates through a
 * shared base (`USD → EUR` and `USD → GBP` give `EUR → GBP`). `null` when nothing connects them.
 */
export function resolveRate(
  quotes: readonly RateQuote[],
  from: string,
  to: string,
): ResolvedRate | null {
  if (from === to) return { rate: 1, asOf: null, source: "identity" };

  const direct = pairRate(quotes, from, to, "manual") ?? pairRate(quotes, from, to, "fetched");

  if (direct) return direct;

  const latest = latestFetched(quotes);
  const bases = new Set([...latest.keys()].map((key) => key.split(":")[0] ?? ""));

  for (const pivot of bases) {
    const toFrom = latest.get(`${pivot}:${from}`);
    const toTo = latest.get(`${pivot}:${to}`);

    if (toFrom && toTo) {
      return {
        rate: toTo.rate / toFrom.rate,
        asOf: toFrom.asOf < toTo.asOf ? toFrom.asOf : toTo.asOf,
        source: "cross",
      };
    }
  }

  return null;
}

/** A currency's minor units: 2 for most, 0 for the yen. */
export function minorUnits(currency: string) {
  return CURRENCIES.find((entry) => entry.code === currency)?.decimals ?? 2;
}

/** `amount × rate`, rounded to the target currency's minor units, as decimal text. */
export function convertAmount(amount: string | number, rate: number, currency: string) {
  const places = minorUnits(currency);
  const scale = 10 ** places;

  return (Math.round(Number(amount) * rate * scale) / scale).toFixed(places);
}

/** What a deal stores about its amount in the reporting currency. */
export interface DealBase {
  readonly baseAmount: string | null;
  readonly baseCurrency: string | null;
  /** Reporting-currency units per one unit of the deal's currency, as decimal text. */
  readonly fxRate: string | null;
  readonly fxRateAt: Date | null;
}

export const NO_BASE: DealBase = {
  baseAmount: null,
  baseCurrency: null,
  fxRate: null,
  fxRateAt: null,
};

/**
 * A deal's base amount: its amount converted into `reporting` at the best rate, stamped with the
 * rate and its day. No amount, or no rate for the currency, stores nothing (the deal shows as
 * not counted). The same currency stamps `now`.
 */
export function dealBase(
  amount: string | null,
  currency: string,
  reporting: string,
  quotes: readonly RateQuote[],
  now: Date,
): DealBase {
  if (amount === null || amount === "" || !Number.isFinite(Number(amount))) return NO_BASE;

  const rate = resolveRate(quotes, currency, reporting);

  if (!rate) return NO_BASE;

  return {
    baseAmount: convertAmount(amount, rate.rate, reporting),
    baseCurrency: reporting,
    fxRate: String(Number(rate.rate.toPrecision(12))),
    fxRateAt: rate.asOf ? new Date(`${rate.asOf}T00:00:00Z`) : now,
  };
}

/** A manual rate as typed: a positive number, at most 10 decimal places and 10 digits before. */
export function rateField(input: string): FieldResult<string> {
  const text = input.trim().replaceAll(",", "");

  if (!/^\d{1,10}(\.\d{1,10})?$/.test(text) || Number(text) <= 0) {
    return { ok: false, message: "Enter a rate above 0, like 1.08" };
  }

  return { ok: true, value: String(Number(text)) };
}

/** A supported currency code, uppercased; `null` when it isn't one. */
export function currencyCode(input: string) {
  const code = input.trim().toUpperCase();

  return isCurrency(code) ? code : null;
}

/** The free public rates service (European Central Bank reference rates, no key). */
export const RATES_URL = "https://api.frankfurter.app/latest";

/** Fetched rates are quoted from this currency. */
export const RATES_BASE = "USD";

/** The request for today's rates of every supported currency, quoted from `RATES_BASE`. */
export function ratesRequestUrl() {
  const url = new URL(RATES_URL);
  const symbols = CURRENCIES.map((entry) => entry.code).filter((code) => code !== RATES_BASE);

  url.searchParams.set("from", RATES_BASE);
  url.searchParams.set("to", symbols.join(","));

  return url;
}

/** The fetched rates of one day, ready to store. */
export interface FetchedRates {
  readonly base: string;
  readonly asOf: string;
  readonly rates: ReadonlyMap<string, number>;
}

/** A rates response, `{ base, date, rates: { EUR: 0.92 } }`; decode it at the boundary. */
export const RatesBody = Schema.Struct({
  base: Schema.String,
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  rates: Schema.Record(Schema.String, Schema.Number),
});

export type RatesBody = typeof RatesBody.Type;

/**
 * The usable rates of a decoded response: only supported currencies and positive finite rates.
 * `null` when none are left.
 */
export function ratesFrom({ base, date, rates }: RatesBody): FetchedRates | null {
  if (!isCurrency(base)) return null;

  const parsed = new Map<string, number>();

  for (const [code, value] of Object.entries(rates)) {
    if (code !== base && isCurrency(code) && Number.isFinite(value) && value > 0) {
      parsed.set(code, value);
    }
  }

  return parsed.size > 0 ? { base, asOf: date, rates: parsed } : null;
}
