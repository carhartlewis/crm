import { createId, ID_PREFIXES } from "@crm/core/ids";
import type { Kv as KvStore } from "@crm/core/kv";
import {
  cleanEmail,
  cleanText,
  createTreg,
  type EnrichmentContract,
  emailVerdict,
  phoneVerdict,
  readTregAnswer,
  type Treg,
  type TregAnswer,
  type TregBody,
  TregError,
} from "@crm/core/enrichment";
import type { EmailStatus, PhoneStatus } from "@crm/core/records";
import { type CallUsage, priceFor, type UsageOrigin } from "@crm/core/usage";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import type { Pool } from "pg";
import { AppConfig } from "../config.ts";
import { Kv } from "./Kv.ts";
import { Postgres } from "./Postgres.ts";

/**
 * Enrichment through treg (ADR 0027). Every paid call goes through `call`: it checks the caller
 * is a member, answers from our cache when it can, tags the treg call with the workspace and
 * writes one `usage_event` row with what it cost and what the workspace pays. It relays; the
 * agent decides what a result means. The cache is shared by every workspace (ADR 0028): answers
 * are public provider data, so a person or company is paid for once, whoever asks first.
 */

/** Who a call runs for, and what ran it; set by the server from a verified token. */
export interface EnrichmentCaller {
  readonly userId: string;
  readonly workspaceId: string;
  readonly origin: UsageOrigin;
  readonly record?: { readonly kind: string; readonly id: string } | null;
}

export interface EnrichmentRequest<C extends EnrichmentContract = EnrichmentContract> {
  readonly contract: C;
  readonly body: TregBody;
  /** Check the hit in the same call: email deliverability, or that a phone line is live. */
  readonly verify?: boolean;
  readonly prefer?: readonly string[];
}

export interface EnrichmentResult<C extends EnrichmentContract = EnrichmentContract> {
  /** What the call found, the same whether it came from treg or our cache. */
  readonly answer: TregAnswer<C>;
  readonly usage: CallUsage;
}

export interface UsageRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly origin: UsageOrigin;
  readonly contract: EnrichmentContract;
  readonly outcome: CallUsage["outcome"];
  readonly costMicro: number;
  readonly priceMicro: number;
  readonly recordKind: string | null;
  readonly recordId: string | null;
  readonly providerCallId: string | null;
  readonly servedBy: string | null;
}

export interface UsageStore {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  markupBps(workspaceId: string): Promise<number>;
  record(row: UsageRow): Promise<void>;
}

export interface EnrichmentService {
  readonly call: <C extends EnrichmentContract>(
    caller: EnrichmentCaller,
    request: EnrichmentRequest<C>,
  ) => Promise<EnrichmentResult<C>>;
  /**
   * An email's mailbox verdict: the one a find or check already stored, else a check now (a paid
   * call filed under `caller`).
   */
  readonly emailStatus: (caller: EnrichmentCaller, email: string) => Promise<EmailStatus>;
  /** A phone number's line verdict from the find that returned it; null when we never saw it. */
  readonly phoneStatus: (phone: string) => Promise<PhoneStatus | null>;
}

export interface EnrichmentDependencies {
  readonly treg: Treg;
  readonly kv: KvStore;
  readonly store: UsageStore;
  readonly newId?: () => string;
}

/** The caller is not a member of the workspace their token names. */
export class NotAMember extends Error {
  override readonly name = "NotAMember";
}

/** How long answers stay in our cache: found values a month, misses a week. */
export const HIT_TTL_SECONDS = 30 * 24 * 60 * 60;

export const MISS_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * One string per question: keys sorted, blanks dropped. The tools normalise identities (lower-case
 * emails and domains, one LinkedIn URL form) before they ask, so one person is one question.
 */
export function questionKey(request: EnrichmentRequest) {
  const entries = Object.entries(request.body)
    .filter(([, value]) => value !== undefined && value !== "")
    .toSorted(([left], [right]) => left.localeCompare(right));

  return JSON.stringify([request.contract, Boolean(request.verify), entries]);
}

const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

// No workspace in the keys: one question has one answer for everyone (ADR 0028).
const answerKey = (request: EnrichmentRequest) =>
  `enrich:shared:answer:${hash(questionKey(request))}`;

const emailKey = (email: string) =>
  `enrich:shared:verdict:email:${hash(email.trim().toLowerCase())}`;

/** Digits only, so `+1 (843) 607-8601` and `+18436078601` are one number. */
const phoneDigits = (phone: string) => phone.replaceAll(/\D/g, "");

const phoneKey = (phone: string) => `enrich:shared:verdict:phone:${hash(phoneDigits(phone))}`;

const isEmailStatus = (value: string | null): value is EmailStatus =>
  value === "valid" ||
  value === "catch_all" ||
  value === "risky" ||
  value === "invalid" ||
  value === "unknown";

const isPhoneStatus = (value: string | null): value is PhoneStatus =>
  value === "live" || value === "dead" || value === "unchecked";

/** The verdicts a call carries, as KV entries, so a later fact needs no second check. */
function verdictsOf(answer: TregAnswer) {
  const output = answer.output;

  if (!output) return [];

  if (answer.contract === "people.email.find" && answer.check && "email" in output) {
    const email = cleanEmail(output.email);

    return email ? [[emailKey(email), emailVerdict(answer.check.verdict)] as const] : [];
  }

  if (answer.contract === "people.phone.find" && "phone" in output) {
    const phone = cleanText(output.phone, 40);

    return phone ? [[phoneKey(phone), phoneVerdict(answer.check)] as const] : [];
  }

  return [];
}

export function makeEnrichment(deps: EnrichmentDependencies): EnrichmentService {
  const newId = deps.newId ?? (() => createId(ID_PREFIXES.usage_event));

  const record = async (
    caller: EnrichmentCaller,
    contract: EnrichmentContract,
    outcome: CallUsage["outcome"],
    spent: {
      costMicro: number;
      priceMicro: number;
      callId: string | null;
      servedBy: string | null;
    },
  ) => {
    const id = newId();

    await deps.store.record({
      id,
      workspaceId: caller.workspaceId,
      userId: caller.userId,
      origin: caller.origin,
      contract,
      outcome,
      costMicro: spent.costMicro,
      priceMicro: spent.priceMicro,
      recordKind: caller.record?.kind ?? null,
      recordId: caller.record?.id ?? null,
      providerCallId: spent.callId,
      servedBy: spent.servedBy,
    });

    return id;
  };

  const call: EnrichmentService["call"] = async (caller, request) => {
    if (!(await deps.store.isMember(caller.workspaceId, caller.userId))) {
      throw new NotAMember("Not a member of this workspace");
    }

    const key = answerKey(request);
    const stored = await deps.kv.get(key);
    const cached = stored ? readTregAnswer(request.contract, stored, null) : null;

    if (cached) {
      const usageId = await record(caller, request.contract, "cached", {
        costMicro: 0,
        priceMicro: 0,
        callId: null,
        servedBy: null,
      });

      return { answer: cached, usage: { usageId, priceMicro: 0, outcome: "cached" } };
    }

    const answer = await deps.treg.call({
      contract: request.contract,
      body: request.body,
      meta: {
        workspace: caller.workspaceId,
        user: caller.userId,
        origin: caller.origin,
        record: caller.record?.id,
      },
      verify: request.verify,
      prefer: request.prefer,
      idempotencyKey: crypto.randomUUID(),
    });

    const priceMicro = priceFor(answer.costMicro, await deps.store.markupBps(caller.workspaceId));

    const usageId = await record(caller, request.contract, answer.outcome, {
      costMicro: answer.costMicro,
      priceMicro,
      callId: answer.callId,
      servedBy: answer.servedBy,
    });

    await deps.kv.set(
      key,
      answer.body,
      answer.outcome === "hit" ? HIT_TTL_SECONDS : MISS_TTL_SECONDS,
    );

    for (const [verdictKey, verdict] of verdictsOf(answer)) {
      // oxlint-disable-next-line no-await-in-loop -- at most one verdict per call.
      await deps.kv.set(verdictKey, verdict, HIT_TTL_SECONDS);
    }

    return { answer, usage: { usageId, priceMicro, outcome: answer.outcome } };
  };

  return {
    call,
    emailStatus: async (caller, email) => {
      const known = await deps.kv.get(emailKey(email));

      if (isEmailStatus(known)) return known;

      const checked = await call(caller, {
        contract: "people.email.verify",
        body: { email: email.trim().toLowerCase() },
      });

      const status = emailVerdict(checked.answer.output?.status);

      await deps.kv.set(emailKey(email), status, HIT_TTL_SECONDS);

      return status;
    },
    phoneStatus: async (phone) => {
      const known = await deps.kv.get(phoneKey(phone));

      return isPhoneStatus(known) ? known : null;
    },
  };
}

/** The ledger and membership in Postgres. */
export function pgUsageStore(pool: Pool): UsageStore {
  return {
    isMember: async (workspaceId, userId) =>
      ((
        await pool.query(
          'SELECT 1 FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
          [workspaceId, userId],
        )
      ).rowCount ?? 0) > 0,
    markupBps: async (workspaceId) => {
      const result = await pool.query<{ usage_markup_bps: number }>(
        "SELECT usage_markup_bps FROM workspace_setting WHERE workspace_id = $1",
        [workspaceId],
      );

      return result.rows[0]?.usage_markup_bps ?? 0;
    },
    record: async (row) => {
      // A retried call keeps its provider call id: it is counted once.
      await pool.query(
        `INSERT INTO usage_event (id, workspace_id, user_id, kind, origin, contract, outcome,
           cost_micro, price_micro, record_kind, record_id, provider_call_id, served_by)
         VALUES ($1, $2, $3, 'enrichment', $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (provider_call_id) DO NOTHING`,
        [
          row.id,
          row.workspaceId,
          row.userId,
          row.origin,
          row.contract,
          row.outcome,
          row.costMicro,
          row.priceMicro,
          row.recordKind,
          row.recordId,
          row.providerCallId,
          row.servedBy,
        ],
      );
    },
  };
}

export { TregError };

/** Enrichment, or null when the API has no treg token (the tools are then not listed). */
export class Enrichment extends Context.Service<Enrichment, EnrichmentService | null>()(
  "@crm/api/services/Enrichment",
) {
  static readonly layer = Layer.effect(
    Enrichment,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const kv = yield* Kv;
      const pool = yield* Postgres;

      // An empty token (a blank line copied from .env.example) means "not set".
      const token = Option.filter(config.tregToken, (value) => Redacted.value(value) !== "");

      return Option.match(token, {
        onNone: () => null,
        onSome: (value) =>
          makeEnrichment({
            treg: createTreg({ token: Redacted.value(value), url: config.tregUrl }),
            kv,
            store: pgUsageStore(pool),
          }),
      });
    }),
  ).pipe(Layer.provide([Kv.layer, Postgres.layer]));
}
