import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import {
  currencyCode,
  type DealBase,
  dealBase,
  RatesBody,
  ratesFrom,
  rateField,
  ratesRequestUrl,
} from "@crm/core/money";
import { Context, Effect, Layer, Option, Schedule, Schema } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import type { MoneyStore, MoneyTx } from "./money-store.ts";
import { pgMoneyStore } from "./money-store.ts";
import { Postgres } from "./Postgres.ts";
import { type Actor, notFound, run, type TxId } from "./record-writes.ts";

type Write<E = never> = Effect.Effect<TxId, NoActiveWorkspace | Invalid | E>;

export interface MoneyService {
  /** The active workspace's settings. */
  readonly settings: (
    actor: Actor,
  ) => Effect.Effect<{ reporting_currency: string }, NoActiveWorkspace | Invalid | NotFound>;
  /** Saves the reporting currency and converts the workspace's open deals into it. */
  readonly saveSettings: (actor: Actor, input: { reporting_currency: string }) => Write<NotFound>;
  /** One `currency` is `rate` units of the reporting currency, for this workspace only. */
  readonly setManualRate: (actor: Actor, currency: string, rate: string) => Write<NotFound>;
  readonly clearManualRate: (actor: Actor, currency: string) => Write<NotFound>;
  /** Fetches today's rates, stores them and converts every workspace's open deals again. */
  readonly refresh: Effect.Effect<void>;
}

export interface MoneyOptions {
  readonly fetch: (url: URL, init: { signal: AbortSignal }) => Promise<Response>;
  readonly now?: () => Date;
}

const sameNumber = (left: string | null, right: string | null) =>
  left === right || (left !== null && right !== null && Number(left) === Number(right));

/** Whether a stored base matches a new one; the rate's day alone never rewrites a row. */
function sameBase(left: DealBase, right: DealBase) {
  return (
    left.baseCurrency === right.baseCurrency &&
    sameNumber(left.baseAmount, right.baseAmount) &&
    sameNumber(left.fxRate, right.fxRate)
  );
}

/** Converts the workspace's open deals at today's best rates; the count of rows changed. */
export async function recomputeOpenDeals(tx: MoneyTx, workspaceId: string, at: Date) {
  const [reporting, quotes, deals] = await Promise.all([
    tx.reportingCurrency(workspaceId),
    tx.rates(workspaceId),
    tx.openDeals(workspaceId),
  ]);

  let changed = 0;

  for (const deal of deals) {
    const next = dealBase(deal.amount, deal.currency, reporting, quotes, at);

    if (!sameBase(deal.base, next)) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction; the order doesn't matter.
      await tx.setDealBase(workspaceId, deal.id, next);
      changed += 1;
    }
  }

  return changed;
}

/** What `Records` asks for when a deal's amount or currency is written. */
export type DealBaseLookup = (
  workspaceId: string,
  amount: string | null,
  currency: string,
) => Promise<DealBase>;

export function dealBaseLookup(store: MoneyStore, now = () => new Date()): DealBaseLookup {
  return async (workspaceId, amount, currency) => {
    const { reporting, quotes } = await store.quotesFor(workspaceId);

    return dealBase(amount, currency, reporting, quotes, now());
  };
}

const RATES_TIMEOUT_MS = 8000;

const decodeRates = Schema.decodeUnknownOption(RatesBody);

const invalid = (message: string) => Effect.fail(new Invalid({ message }));

export function makeMoney(store: MoneyStore, options: MoneyOptions): MoneyService {
  const now = options.now ?? (() => new Date());
  const today = () => now().toISOString().slice(0, 10);

  /** One membership-checked transaction; `apply` gets the verified workspace. */
  const inWorkspace = <A, E>(
    actor: Actor,
    label: string,
    apply: (
      workspaceId: string,
      tx: MoneyTx,
    ) => Promise<{ ok: true; value: A } | { ok: false; error: E }>,
  ) =>
    Effect.gen(function* () {
      const { result, txid } = yield* run(label, () =>
        store.transact(async (tx) => {
          const workspace = authorizeWorkspace({
            activeWorkspaceId: actor.activeWorkspaceId,
            isMember: actor.activeWorkspaceId
              ? await tx.isMember(actor.activeWorkspaceId, actor.userId)
              : false,
          });

          if (!workspace.ok) {
            return {
              ok: false as const,
              error: new NoActiveWorkspace({ message: workspace.message }),
            };
          }

          return apply(workspace.value, tx);
        }),
      );

      if (!result.ok) return yield* Effect.fail(result.error);

      return { value: result.value, txid };
    });

  const write = <E>(
    actor: Actor,
    label: string,
    apply: (workspaceId: string, tx: MoneyTx) => Promise<{ ok: true } | { ok: false; error: E }>,
  ): Write<E> =>
    inWorkspace(actor, label, async (workspaceId, tx) => {
      const outcome = await apply(workspaceId, tx);

      return outcome.ok ? { ok: true as const, value: undefined } : outcome;
    }).pipe(Effect.map(({ txid }) => ({ txid })));

  const refresh = Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: async () => {
        const response = await options.fetch(ratesRequestUrl(), {
          signal: AbortSignal.timeout(RATES_TIMEOUT_MS),
        });

        if (!response.ok) throw new Error(`rates service answered ${response.status}`);

        const json: unknown = await response.json();

        return json;
      },
      catch: (cause) => cause,
    });

    const rates = Option.match(decodeRates(body), { onNone: () => null, onSome: ratesFrom });

    if (!rates) return yield* Effect.logWarning("money: the rates service sent no usable rates");

    yield* run("save fetched rates", () => store.saveFetched(rates));

    const workspaces = yield* run("list workspaces", () => store.workspacesWithOpenDeals());

    for (const workspaceId of workspaces) {
      yield* run("recompute deals", () =>
        store.transact((tx) => recomputeOpenDeals(tx, workspaceId, now())),
      );
    }

    yield* Effect.logInfo(`money: stored ${rates.rates.size} rates for ${rates.asOf}`);
  }).pipe(Effect.catchCause((cause) => Effect.logWarning("money: refreshing rates failed", cause)));

  return {
    settings: (actor) =>
      inWorkspace<string, never>(actor, "read settings", async (workspaceId, tx) => ({
        ok: true,
        value: await tx.reportingCurrency(workspaceId),
      })).pipe(Effect.map(({ value }) => ({ reporting_currency: value }))),

    saveSettings: (actor, input) => {
      const code = currencyCode(input.reporting_currency);

      if (!code) return invalid("Choose a currency");

      return write<never>(actor, "save settings", async (workspaceId, tx) => {
        await tx.setReportingCurrency(workspaceId, code);
        await recomputeOpenDeals(tx, workspaceId, now());

        return { ok: true };
      });
    },

    setManualRate: (actor, currencyInput, rateInput) => {
      const currency = currencyCode(currencyInput);

      if (!currency) return Effect.fail(notFound("Currency"));

      const rate = rateField(rateInput);

      if (!rate.ok) return invalid(rate.message);

      return write<Invalid>(actor, "set manual rate", async (workspaceId, tx) => {
        const reporting = await tx.reportingCurrency(workspaceId);

        if (currency === reporting) {
          return {
            ok: false,
            error: new Invalid({ message: "The reporting currency is always 1" }),
          };
        }

        await tx.setManualRate(workspaceId, {
          base: currency,
          quote: reporting,
          rate: rate.value,
          asOf: today(),
        });
        await recomputeOpenDeals(tx, workspaceId, now());

        return { ok: true };
      });
    },

    clearManualRate: (actor, currencyInput) => {
      const currency = currencyCode(currencyInput);

      if (!currency) return Effect.fail(notFound("Currency"));

      return write<NotFound>(actor, "clear manual rate", async (workspaceId, tx) => {
        const reporting = await tx.reportingCurrency(workspaceId);

        if (!(await tx.clearManualRate(workspaceId, currency, reporting))) {
          return { ok: false, error: notFound("Manual rate") };
        }

        await recomputeOpenDeals(tx, workspaceId, now());

        return { ok: true };
      });
    },

    refresh,
  };
}

const REFRESH_EVERY = "12 hours";

export class Money extends Context.Service<Money, MoneyService>()("@crm/api/services/Money") {
  /** Fetches rates when the API starts and every 12 hours after, for as long as the layer lives. */
  static readonly layer = Layer.effect(
    Money,
    Effect.gen(function* () {
      const money = makeMoney(pgMoneyStore(yield* Postgres), {
        fetch: (url, init) => fetch(url, init),
      });

      yield* money.refresh.pipe(Effect.repeat(Schedule.spaced(REFRESH_EVERY)), Effect.forkScoped);

      return money;
    }),
  ).pipe(Layer.provide(Postgres.layer));
}
