import { type DealBase, NO_BASE, type RateQuote } from "@crm/core/money";
import { isOpenStage, REPORTING_CURRENCY } from "@crm/core/records";
import { type DealAmount, type MoneyStore, type MoneyTx } from "./money-store.ts";

export interface MemoryRate extends RateQuote {
  readonly workspaceId: string | null;
}

export interface MemoryDeal {
  readonly workspaceId: string;
  readonly amount: string | null;
  readonly currency: string;
  readonly stage: string;
  readonly base: DealBase;
}

interface State {
  settings: Map<string, string>;
  rates: MemoryRate[];
  deals: Map<string, MemoryDeal>;
}

const copy = (state: State): State => ({
  settings: new Map(state.settings),
  rates: [...state.rates],
  deals: new Map(state.deals),
});

const visible = (rates: readonly MemoryRate[], workspaceId: string) =>
  rates.filter((rate) => rate.workspaceId === null || rate.workspaceId === workspaceId);

/**
 * In-memory `MoneyStore` for tests: members are `workspaceId:userId` pairs, txids count up, and a
 * transaction that throws leaves everything unchanged.
 */
export function createMemoryMoneyStore(members: Iterable<string>) {
  const memberships = new Set(members);
  let state: State = { settings: new Map(), rates: [], deals: new Map() };
  let txid = 2000;

  const txOf = (draft: State): MoneyTx => ({
    isMember: async (workspaceId, userId) => memberships.has(`${workspaceId}:${userId}`),
    reportingCurrency: async (workspaceId) => draft.settings.get(workspaceId) ?? REPORTING_CURRENCY,
    setReportingCurrency: async (workspaceId, currency) => {
      draft.settings.set(workspaceId, currency);
    },
    rates: async (workspaceId) => visible(draft.rates, workspaceId),
    setManualRate: async (workspaceId, rate) => {
      const samePair = (row: MemoryRate) =>
        row.source === "manual" && row.base === rate.base && row.quote === rate.quote;

      draft.rates = [
        ...draft.rates.filter((row) => !(samePair(row) && row.workspaceId === workspaceId)),
        { ...rate, source: "manual", workspaceId },
      ];
    },
    clearManualRate: async (workspaceId, first, second) => {
      const before = draft.rates.length;

      draft.rates = draft.rates.filter(
        (row) =>
          !(
            row.workspaceId === workspaceId &&
            row.source === "manual" &&
            ((row.base === first && row.quote === second) ||
              (row.base === second && row.quote === first))
          ),
      );

      return draft.rates.length < before;
    },
    openDeals: async (workspaceId) =>
      [...draft.deals].flatMap(([id, deal]): DealAmount[] =>
        deal.workspaceId === workspaceId && isOpenStage(deal.stage)
          ? [{ id, amount: deal.amount, currency: deal.currency, base: deal.base }]
          : [],
      ),
    setDealBase: async (workspaceId, id, base) => {
      const deal = draft.deals.get(id);

      if (deal?.workspaceId === workspaceId) draft.deals.set(id, { ...deal, base });
    },
  });

  const store: MoneyStore = {
    transact: async (fn) => {
      const draft = copy(state);
      const result = await fn(txOf(draft));

      state = draft;
      txid += 1;

      return { result, txid };
    },
    quotesFor: async (workspaceId) => ({
      reporting: state.settings.get(workspaceId) ?? REPORTING_CURRENCY,
      quotes: visible(state.rates, workspaceId),
    }),
    saveFetched: async (fetched) => {
      const kept = state.rates.filter(
        (row) =>
          !(row.source === "fetched" && row.asOf === fetched.asOf && row.base === fetched.base),
      );

      state = {
        ...state,
        rates: [
          ...kept,
          ...[...fetched.rates].map(([quote, rate]) => ({
            base: fetched.base,
            quote,
            rate: String(rate),
            asOf: fetched.asOf,
            source: "fetched",
            workspaceId: null,
          })),
        ],
      };
    },
    workspacesWithOpenDeals: async () => [
      ...new Set(
        [...state.deals.values()].flatMap((deal) =>
          deal.amount !== null && isOpenStage(deal.stage) ? [deal.workspaceId] : [],
        ),
      ),
    ],
  };

  return {
    store,
    rates: () => state.rates,
    deal: (id: string) => state.deals.get(id),
    addDeal: (id: string, deal: Omit<MemoryDeal, "base"> & { base?: DealBase }) => {
      state.deals.set(id, { base: NO_BASE, ...deal });
    },
    addRate: (rate: MemoryRate) => {
      state.rates.push(rate);
    },
  };
}
