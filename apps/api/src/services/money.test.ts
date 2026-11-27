import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Cause, Effect, Exit, Option, References } from "effect";
import { makeCompanies } from "./Companies.ts";
import { dealBaseLookup, makeMoney } from "./Money.ts";
import { createMemoryMoneyStore } from "./money-store-memory.ts";
import { createMemoryRecordStore } from "./record-store-memory.ts";
import type { Actor } from "./record-writes.ts";
import { makeRecords } from "./Records.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const stranger: Actor = { userId: "user_eve", activeWorkspaceId: "ws_a" };
const at = new Date("2026-11-26T12:00:00Z");

const rates = (date: string, values: Record<string, number>) =>
  Response.json({ amount: 1, base: "USD", date, rates: values });

function setup(answer: () => Response = () => rates("2026-11-25", { EUR: 0.8, GBP: 0.5 })) {
  const memory = createMemoryMoneyStore(["ws_a:user_alice", "ws_b:user_bob"]);
  const requests: URL[] = [];

  const money = makeMoney(memory.store, {
    fetch: async (url) => {
      requests.push(url);

      return answer();
    },
    now: () => at,
  });

  return { ...memory, money, requests };
}

const quiet = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.provideService(effect, References.MinimumLogLevel, "None");

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(quiet(effect));

async function failure<A, E extends object>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(quiet(effect));

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    onSome: (error) => error.constructor.name,
  });
}

describe("fetched rates", () => {
  test("stores the day's rates and converts open deals with an amount", async () => {
    const env = setup();

    env.addDeal("del_eur", {
      workspaceId: "ws_a",
      amount: "1000.00",
      currency: "EUR",
      stage: "demo_booked",
    });
    env.addDeal("del_won", {
      workspaceId: "ws_a",
      amount: "1000.00",
      currency: "EUR",
      stage: "closed_won",
    });

    await run(env.money.refresh);

    expect(env.requests[0]?.searchParams.get("from")).toBe("USD");
    expect(env.rates()).toHaveLength(2);
    expect(env.deal("del_eur")?.base).toEqual({
      baseAmount: "1250.00",
      baseCurrency: "USD",
      fxRate: "1.25",
      fxRateAt: new Date("2026-11-25T00:00:00Z"),
    });
    // Closed deals keep the rate they closed at.
    expect(env.deal("del_won")?.base.baseAmount).toBeNull();
  });

  test("an unreachable or broken rates service changes nothing", async () => {
    const env = setup(() => new Response("down", { status: 503 }));

    await run(env.money.refresh);

    const broken = setup(() => Response.json({ message: "nope" }));

    await run(broken.money.refresh);

    expect(env.rates()).toEqual([]);
    expect(broken.rates()).toEqual([]);
  });
});

describe("reporting currency", () => {
  test("members read and save it; open deals are converted into the new currency", async () => {
    const env = setup();

    env.addDeal("del_usd", {
      workspaceId: "ws_a",
      amount: "1000.00",
      currency: "USD",
      stage: "contract_sent",
    });
    await run(env.money.refresh);

    expect(await run(env.money.settings(alice))).toEqual({ reporting_currency: "USD" });

    const { txid } = await run(env.money.saveSettings(alice, { reporting_currency: "eur" }));

    expect(txid).toBeGreaterThan(0);
    expect(await run(env.money.settings(alice))).toEqual({ reporting_currency: "EUR" });
    expect(env.deal("del_usd")?.base).toMatchObject({ baseAmount: "800.00", baseCurrency: "EUR" });
  });

  test("refuses an unknown currency and non-members", async () => {
    const env = setup();

    expect(await failure(env.money.saveSettings(alice, { reporting_currency: "XYZ" }))).toBe(
      "Invalid",
    );
    expect(await failure(env.money.saveSettings(stranger, { reporting_currency: "EUR" }))).toBe(
      "NoActiveWorkspace",
    );
    expect(await failure(env.money.settings(stranger))).toBe("NoActiveWorkspace");
  });
});

describe("manual rates", () => {
  test("a manual rate beats the fetched one, and clearing it goes back", async () => {
    const env = setup();

    env.addDeal("del_gbp", {
      workspaceId: "ws_a",
      amount: "100.00",
      currency: "GBP",
      stage: "demo_booked",
    });
    await run(env.money.refresh);
    expect(env.deal("del_gbp")?.base.baseAmount).toBe("200.00");

    await run(env.money.setManualRate(alice, "GBP", "1.3"));
    expect(env.deal("del_gbp")?.base).toMatchObject({ baseAmount: "130.00", fxRate: "1.3" });

    await run(env.money.clearManualRate(alice, "GBP"));
    expect(env.deal("del_gbp")?.base.baseAmount).toBe("200.00");
    expect(await failure(env.money.clearManualRate(alice, "GBP"))).toBe("NotFound");
  });

  test("is the workspace's own, never another's", async () => {
    const env = setup();
    const bob: Actor = { userId: "user_bob", activeWorkspaceId: "ws_b" };

    await run(env.money.setManualRate(alice, "EUR", "1.1"));
    await run(env.money.setManualRate(bob, "EUR", "1.2"));

    const lookup = dealBaseLookup(env.store, () => at);

    expect((await lookup("ws_a", "10.00", "EUR")).baseAmount).toBe("11.00");
    expect((await lookup("ws_b", "10.00", "EUR")).baseAmount).toBe("12.00");
    // Each workspace keeps its own rate for the pair, dated today.
    expect(env.rates().map((rate) => [rate.workspaceId, rate.asOf])).toEqual([
      ["ws_a", "2026-11-26"],
      ["ws_b", "2026-11-26"],
    ]);
  });

  test("refuses a bad rate, an unknown currency and the reporting currency itself", async () => {
    const env = setup();

    expect(await failure(env.money.setManualRate(alice, "EUR", "0"))).toBe("Invalid");
    expect(await failure(env.money.setManualRate(alice, "XYZ", "1"))).toBe("NotFound");
    expect(await failure(env.money.setManualRate(alice, "USD", "2"))).toBe("Invalid");
  });
});

function records() {
  const recordMemory = createMemoryRecordStore(["ws_a:user_alice"]);
  const money = createMemoryMoneyStore(["ws_a:user_alice"]);

  money.addRate({
    base: "USD",
    quote: "EUR",
    rate: "0.8",
    asOf: "2026-11-25",
    source: "fetched",
    workspaceId: null,
  });

  return {
    ...recordMemory,
    companies: makeCompanies(recordMemory.store),
    records: makeRecords(
      recordMemory.store,
      () => at,
      dealBaseLookup(money.store, () => at),
    ),
  };
}

describe("deal writes store base amounts", () => {
  test("on create and when the amount or currency changes", async () => {
    const env = records();
    const companyId = createId("com");
    const id = createId("del");

    await run(env.companies.create(alice, { id: companyId, name: "Northwind", domain: null }));
    await run(
      env.records.deals.create(alice, {
        id,
        name: "Rollout",
        company_id: companyId,
        amount: "1000",
        currency: "EUR",
      }),
    );

    expect(env.table("deal").get(id)).toMatchObject({
      baseAmount: "1250.00",
      baseCurrency: "USD",
      fxRate: "1.25",
      fxRateAt: new Date("2026-11-25T00:00:00Z"),
    });

    await run(env.records.deals.update(alice, id, { amount: "2000" }));
    expect(env.table("deal").get(id)?.["baseAmount"]).toBe("2500.00");

    await run(env.records.deals.update(alice, id, { currency: "USD" }));
    expect(env.table("deal").get(id)).toMatchObject({ baseAmount: "2000.00", fxRate: "1" });

    await run(env.records.deals.update(alice, id, { currency: "ZAR" }));
    expect(env.table("deal").get(id)).toMatchObject({ baseAmount: null, baseCurrency: null });

    await run(env.records.deals.update(alice, id, { amount: null }));
    expect(env.table("deal").get(id)?.["baseAmount"]).toBeNull();
  });
});
