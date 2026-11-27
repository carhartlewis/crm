import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import {
  convertAmount,
  dealBase,
  RatesBody,
  ratesFrom,
  type RateQuote,
  rateField,
  ratesRequestUrl,
  resolveRate,
} from "./index.ts";

const fetched = (quote: string, rate: number, asOf = "2026-11-25"): RateQuote => ({
  base: "USD",
  quote,
  rate: String(rate),
  asOf,
  source: "fetched",
});

describe("resolveRate", () => {
  test("the same currency is 1", () => {
    expect(resolveRate([], "EUR", "EUR")).toEqual({ rate: 1, asOf: null, source: "identity" });
  });

  test("uses a quote in either direction", () => {
    const quotes = [fetched("EUR", 0.8)];

    expect(resolveRate(quotes, "USD", "EUR")?.rate).toBeCloseTo(0.8);
    expect(resolveRate(quotes, "EUR", "USD")?.rate).toBeCloseTo(1.25);
  });

  test("the latest day wins among fetched quotes", () => {
    const quotes = [fetched("EUR", 0.9, "2026-11-20"), fetched("EUR", 0.8, "2026-11-25")];

    expect(resolveRate(quotes, "USD", "EUR")).toEqual({
      rate: 0.8,
      asOf: "2026-11-25",
      source: "fetched",
    });
  });

  test("a manual rate beats a newer fetched one", () => {
    const manual: RateQuote = {
      base: "EUR",
      quote: "USD",
      rate: "1.1",
      asOf: "2026-11-01",
      source: "manual",
    };

    expect(resolveRate([fetched("EUR", 0.8), manual], "EUR", "USD")).toEqual({
      rate: 1.1,
      asOf: "2026-11-01",
      source: "manual",
    });
  });

  test("crosses through a shared base, dated by the older quote", () => {
    const quotes = [fetched("EUR", 0.8, "2026-11-24"), fetched("GBP", 0.5)];
    const rate = resolveRate(quotes, "EUR", "GBP");

    expect(rate?.rate).toBeCloseTo(0.625);
    expect(rate?.asOf).toBe("2026-11-24");
    expect(rate?.source).toBe("cross");
  });

  test("nothing connects the pair, or the rate is not positive", () => {
    expect(resolveRate([fetched("EUR", 0.8)], "GBP", "JPY")).toBeNull();
    expect(resolveRate([fetched("EUR", 0)], "USD", "EUR")).toBeNull();
  });
});

describe("conversion", () => {
  test("rounds to the target currency's minor units", () => {
    expect(convertAmount("1000.00", 0.923456, "EUR")).toBe("923.46");
    expect(convertAmount("10.00", 149.567, "JPY")).toBe("1496");
  });

  test("a deal's base amount carries the rate and its day", () => {
    const now = new Date("2026-11-26T12:00:00Z");

    expect(dealBase("1000.00", "EUR", "USD", [fetched("EUR", 0.8)], now)).toEqual({
      baseAmount: "1250.00",
      baseCurrency: "USD",
      fxRate: "1.25",
      fxRateAt: new Date("2026-11-25T00:00:00Z"),
    });
    expect(dealBase("1000.00", "USD", "USD", [], now)).toMatchObject({
      baseAmount: "1000.00",
      fxRate: "1",
      fxRateAt: now,
    });
  });

  test("no amount or no rate stores nothing", () => {
    const now = new Date();
    const empty = { baseAmount: null, baseCurrency: null, fxRate: null, fxRateAt: null };

    expect(dealBase(null, "EUR", "USD", [fetched("EUR", 0.8)], now)).toEqual(empty);
    expect(dealBase("10.00", "ZAR", "USD", [fetched("EUR", 0.8)], now)).toEqual(empty);
  });
});

describe("rates input", () => {
  test("a manual rate must be a positive number", () => {
    expect(rateField(" 1.08 ")).toEqual({ ok: true, value: "1.08" });
    expect(rateField("0").ok).toBe(false);
    expect(rateField("-2").ok).toBe(false);
    expect(rateField("abc").ok).toBe(false);
  });

  test("reads a rates response: supported currencies and positive rates only", () => {
    const decode = Schema.decodeUnknownOption(RatesBody);

    const body = decode({
      amount: 1,
      base: "USD",
      date: "2026-11-25",
      rates: { EUR: 0.92, GBP: 0.79, XYZ: 3, JPY: -1 },
    });

    expect(Option.map(body, ratesFrom)).toEqual(
      Option.some({
        base: "USD",
        asOf: "2026-11-25",
        rates: new Map([
          ["EUR", 0.92],
          ["GBP", 0.79],
        ]),
      }),
    );
    expect(Option.isNone(decode({ message: "not found" }))).toBe(true);
    expect(ratesFrom({ base: "XYZ", date: "2026-11-25", rates: { EUR: 1 } })).toBeNull();
  });

  test("asks for every supported currency from USD", () => {
    const url = ratesRequestUrl();

    expect(url.searchParams.get("from")).toBe("USD");
    expect(url.searchParams.get("to")?.split(",")).toContain("ZAR");
    expect(url.searchParams.get("to")?.split(",")).not.toContain("USD");
  });
});
