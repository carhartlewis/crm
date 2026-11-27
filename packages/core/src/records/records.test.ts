import { describe, expect, test } from "bun:test";
import {
  closingBucket,
  COMPANY_FIELDS,
  DEAL_FIELDS,
  formatMoney,
  normalizePatch,
  optionalDate,
  optionalMoney,
  pipelineSummary,
  splitName,
  stageSteps,
} from "@crm/core/records";

describe("field normalisers", () => {
  test("money accepts symbols, separators and k/m, and stores two decimals", () => {
    expect(optionalMoney("$186,000")).toEqual({ ok: true, value: "186000.00" });
    expect(optionalMoney("1.2k")).toEqual({ ok: true, value: "1200.00" });
    expect(optionalMoney(" ")).toEqual({ ok: true, value: null });
    expect(optionalMoney("lots").ok).toBe(false);
    expect(optionalMoney("1e15").ok).toBe(false);
  });

  test("dates must be real calendar days", () => {
    expect(optionalDate("2026-08-29")).toEqual({ ok: true, value: "2026-08-29" });
    expect(optionalDate("2026-02-30").ok).toBe(false);
    expect(optionalDate("")).toEqual({ ok: true, value: null });
  });
});

describe("normalizePatch", () => {
  test("normalises each listed column and leaves absent ones out", () => {
    expect(
      normalizePatch(COMPANY_FIELDS, {
        name: "  Northwind  Labs ",
        domain: "https://www.Northwind.io/x",
        email: "Hello@Northwind.io",
        phone: undefined,
      }),
    ).toEqual({
      ok: true,
      value: { name: "Northwind Labs", domain: "northwind.io", email: "hello@northwind.io" },
    });
  });

  test("refuses unknown columns and invalid values, naming the field", () => {
    expect(normalizePatch(COMPANY_FIELDS, { workspace_id: "x" })).toEqual({
      ok: false,
      message: "workspace_id can't be changed",
    });
    expect(normalizePatch(COMPANY_FIELDS, { email: "nope" })).toEqual({
      ok: false,
      message: "Email: Enter a valid email",
    });
    expect(normalizePatch(DEAL_FIELDS, { company_id: null }).ok).toBe(false);
  });
});

const deal = (stage: string, amount: string | null, close: string | null, currency = "USD") => ({
  stage,
  amount,
  currency,
  expected_close_date: close,
  archived_at: null,
});

describe("pipeline", () => {
  test("sums open deals in the reporting currency and finds the next close", () => {
    expect(
      pipelineSummary([
        deal("contract_sent", "186000.00", "2026-08-29"),
        deal("qualified_to_buy", "42000.00", "2026-10-16"),
        deal("closed_won", "92000.00", "2026-07-31"),
        deal("demo_booked", "1000.00", null, "EUR"),
      ]),
    ).toEqual({
      openCount: 3,
      total: 228000,
      notCounted: 1,
      missing: ["EUR"],
      nextClose: "2026-08-29",
    });
  });

  test("adds stored base amounts in the reporting currency; the rest are not counted", () => {
    expect(
      pipelineSummary(
        [
          {
            ...deal("contract_sent", "1000.00", null, "USD"),
            base_amount: "920.00",
            base_currency: "EUR",
          },
          {
            ...deal("demo_booked", "500.00", null, "EUR"),
            base_amount: "500.00",
            base_currency: "EUR",
          },
          { ...deal("demo_booked", "100.00", null, "GBP"), base_amount: null },
          {
            ...deal("demo_booked", "100.00", null, "JPY"),
            base_amount: "1.00",
            base_currency: "USD",
          },
        ],
        "EUR",
      ),
    ).toEqual({
      openCount: 4,
      total: 1420,
      notCounted: 2,
      missing: ["GBP", "JPY"],
      nextClose: null,
    });
  });

  test("closing buckets: overdue only for open deals", () => {
    const today = "2026-11-26";

    expect(
      closingBucket({ stage: "contract_sent", expected_close_date: "2026-11-01" }, today),
    ).toBe("overdue");
    expect(closingBucket({ stage: "closed_won", expected_close_date: "2026-11-01" }, today)).toBe(
      "this_month",
    );
    expect(closingBucket({ stage: "demo_booked", expected_close_date: "2026-12-04" }, today)).toBe(
      "next_month",
    );
    expect(closingBucket({ stage: "demo_booked", expected_close_date: "2027-03-01" }, today)).toBe(
      "later",
    );
    expect(closingBucket({ stage: "demo_booked", expected_close_date: null }, today)).toBe("none");
    expect(
      closingBucket({ stage: "closed_lost", expected_close_date: "2026-01-01" }, today),
    ).toBeNull();
  });

  test("the stepper ends in Closed won, or in the stage a deal was lost in", () => {
    expect(stageSteps("contract_sent").map((step) => step.id)).toEqual([
      "demo_booked",
      "qualified_to_buy",
      "decision_maker_bought_in",
      "contract_sent",
      "closed_won",
    ]);
    expect(stageSteps("closed_lost").at(-1)?.id).toBe("closed_lost");
  });
});

describe("display", () => {
  test("money shows cents only when present", () => {
    expect(formatMoney("186000.00")).toBe("$186,000");
    expect(formatMoney("34750.50")).toBe("$34,750.50");
    expect(formatMoney(null)).toBeNull();
  });

  test("a typed full name splits on its last word", () => {
    expect(splitName("Priya Raghunathan")).toEqual({ first: "Priya", last: "Raghunathan" });
    expect(splitName("Mary Ann Smith")).toEqual({ first: "Mary Ann", last: "Smith" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: null });
  });
});
