import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import type { Db } from "@crm/core/db";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { PERSON_PHOTO_PATTERN } from "@crm/core/brand";
import {
  bandFor,
  type BriefSections,
  type ContactFactField,
  type FactDecision,
  type FactJudgement,
  type FactOutcome,
  factOutcome,
  needsJudgement,
  sameFactValue,
  isContactFactField,
  isContactFactId,
  isContactId,
  isDealId,
  isFactBand,
  isFactDecision,
  optionalProse,
  optionalText,
  optionalUrl,
} from "@crm/core/records";
import { isCompanyId } from "@crm/core/company";
import { gatewayJev } from "@crm/memory/jev-gateway";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import { AppConfig } from "../config.ts";
import { Database } from "./Database.ts";
import { jevFactJudge } from "./fact-judge.ts";
import { Images } from "./Images.ts";
import type { JsonValue } from "./record-store.ts";
import { type DbTx, transactWithTxid } from "./txid.ts";

/**
 * What the agent learns about records (ADR 0024), stored as it writes it through `crm__` tools:
 * enrichment state, contact facts, contact briefs, and email and meeting activity from the
 * member's connected apps. It checks membership, references and shapes, and keeps every write in
 * one transaction with its txid. The agent judges what is true; the shared fact rules
 * (`factOutcome`, ADR 0025) decide whether a fact fills the contact or waits for a member.
 */

export type EnrichedTable = "company" | "contact";

/** A record the writes point at, with what they need of it. */
export interface RecordRef {
  readonly companyId: string | null;
  readonly lastActivityAt: Date | null;
}

export interface FactRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly contactId: string;
  readonly field: string;
  readonly value: string;
  readonly score: number;
  readonly band: string;
  readonly evidence: JsonValue;
  readonly sourceUrl: string | null;
  readonly status: string;
}

export interface FactPatch {
  status: string;
  decidedById?: string | null;
  decidedAt?: Date | null;
}

export interface BriefRow {
  readonly contactId: string;
  readonly workspaceId: string;
  readonly narrative: string;
  readonly sections: JsonValue;
  readonly sourceUrl: string | null;
  readonly refreshedAt: Date;
}

export type SyncKey = "emailThreadId" | "calendarEventId";

export interface LoggedActivity {
  readonly type: "email" | "meeting";
  readonly source: "email" | "calendar";
  readonly subject: string;
  readonly body: string | null;
  readonly occurredAt: Date;
  readonly companyId: string | null;
  readonly contactId: string | null;
  readonly dealId: string | null;
  readonly externalUrl: string | null;
  readonly meta: JsonValue;
}

/** Row operations inside one transaction, always scoped by workspace. */
export interface IntelTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  record(
    table: "company" | "contact" | "deal",
    workspaceId: string,
    id: string,
  ): Promise<RecordRef | null>;
  setEnrichment(
    table: EnrichedTable,
    workspaceId: string,
    id: string,
    patch: { enrichmentStatus: string; enrichedAt?: Date; enrichmentError: string | null },
  ): Promise<void>;
  touch(
    table: "company" | "contact" | "deal",
    workspaceId: string,
    id: string,
    at: Date,
  ): Promise<void>;
  fact(workspaceId: string, id: string): Promise<FactRow | null>;
  /** The ids of a contact's facts for one field in one status. */
  factIds(workspaceId: string, contactId: string, field: string, status: string): Promise<string[]>;
  /** The values of a contact's facts for one field in one status. */
  factValues(
    workspaceId: string,
    contactId: string,
    field: string,
    status: string,
  ): Promise<string[]>;
  /** A contact's value for one fact field; null when empty or the contact is missing. */
  contactValue(
    workspaceId: string,
    contactId: string,
    field: ContactFactField,
  ): Promise<string | null>;
  setContactValue(
    workspaceId: string,
    contactId: string,
    field: ContactFactField,
    value: string,
  ): Promise<void>;
  insertFact(row: FactRow): Promise<void>;
  updateFact(workspaceId: string, id: string, patch: FactPatch): Promise<void>;
  putBrief(row: BriefRow): Promise<void>;
  /** The id of the activity logged from this thread or event, if any. */
  activityBy(workspaceId: string, key: SyncKey, value: string): Promise<string | null>;
  insertActivity(
    row: LoggedActivity & {
      id: string;
      workspaceId: string;
      createdById: string;
      emailThreadId: string | null;
      calendarEventId: string | null;
    },
  ): Promise<void>;
  updateActivity(workspaceId: string, id: string, row: LoggedActivity): Promise<void>;
}

export interface IntelStore {
  transact<A>(fn: (tx: IntelTx) => Promise<A>): Promise<{ result: A; txid: number }>;
}

/** Who is acting: the session user (or the agent's caller) and their active workspace. */
export interface IntelActor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

type Failure = Invalid | NotFound | NoActiveWorkspace;

type Outcome<A> = { ok: true; value: A } | { ok: false; error: Failure };

export class IntelStoreError extends Schema.TaggedError<IntelStoreError>()("IntelStoreError", {
  cause: Schema.Defect(),
}) {}

const invalid = (message: string) => new Invalid({ message });
const ok = <A>(value: A): Outcome<A> => ({ ok: true, value });
const fail = (error: Failure): Outcome<never> => ({ ok: false, error });

export interface EnrichmentInput {
  readonly kind: string;
  readonly id: string;
  /** `running`, `complete`, `failed` or `skipped`. */
  readonly status: string;
  readonly error?: string | null | undefined;
}

export interface FactInput {
  readonly contactId: string;
  readonly field: string;
  readonly value: string;
  readonly score: number;
  readonly band?: string | null | undefined;
  readonly evidence?: readonly string[] | null | undefined;
  readonly sourceUrl?: string | null | undefined;
}

export interface BriefInput {
  readonly contactId: string;
  readonly narrative: string;
  readonly sections: BriefSections;
  readonly sourceUrl?: string | null | undefined;
}

export interface EmailInput {
  readonly threadId: string;
  readonly subject: string;
  readonly summary?: string | null | undefined;
  readonly occurredAt: string;
  readonly messages?: number | null | undefined;
  readonly lastReplyAt?: string | null | undefined;
  readonly contactId?: string | null | undefined;
  readonly companyId?: string | null | undefined;
  readonly dealId?: string | null | undefined;
  readonly externalUrl?: string | null | undefined;
}

export interface MeetingInput {
  readonly eventId: string;
  readonly subject: string;
  readonly summary?: string | null | undefined;
  readonly occurredAt: string;
  readonly durationMinutes?: number | null | undefined;
  readonly attendees?: number | null | undefined;
  readonly contactId?: string | null | undefined;
  readonly companyId?: string | null | undefined;
  readonly dealId?: string | null | undefined;
  readonly externalUrl?: string | null | undefined;
}

type Write<A> = Effect.Effect<A & { readonly txid: number }, Failure>;

/** Jev's reading of a new value against a member's own (see `FactJudgement`). */
export type FactJudge = (input: {
  field: string;
  current: string;
  proposed: string;
  evidence: readonly string[];
}) => Promise<FactJudgement>;

/** Copies a person photo from context.dev into storage for a contact; null when it can't. */
export type ContactPhotos = (contactId: string, source: string) => Promise<string | null>;

export interface IntelDependencies {
  readonly now?: () => Date;
  readonly judge?: FactJudge | null;
  readonly photos?: ContactPhotos | null;
}

export interface RecordedFact {
  /** The stored fact, or null when it was not stored (`kept` or `too_unsure`). */
  readonly id: string | null;
  readonly outcome: FactOutcome;
  readonly txid: number | null;
}

export interface IntelService {
  readonly setEnrichment: (actor: IntelActor, input: EnrichmentInput) => Write<object>;
  /**
   * Records a fact the agent found. It fills the contact at once unless it would replace a
   * member's own value; older proposals for the same field are superseded.
   */
  readonly recordFact: (
    actor: IntelActor,
    input: FactInput,
  ) => Effect.Effect<RecordedFact, Failure>;
  /** A member applies or dismisses a proposed fact. */
  readonly decideFact: (actor: IntelActor, id: string, status: string) => Write<object>;
  readonly writeBrief: (actor: IntelActor, input: BriefInput) => Write<object>;
  /** Upserts one email activity per thread. */
  readonly logEmail: (
    actor: IntelActor,
    input: EmailInput,
  ) => Write<{ id: string; created: boolean }>;
  /** Upserts one meeting activity per calendar event. */
  readonly logMeeting: (
    actor: IntelActor,
    input: MeetingInput,
  ) => Write<{ id: string; created: boolean }>;
}

const ENRICHMENT_WRITES = new Set(["running", "complete", "failed", "skipped"]);

/** A timestamp from the agent; null when it doesn't parse. */
function instant(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

const text = (value: string | null | undefined, max: number) => optionalText(value ?? null, max);

/** The company, contact and deal an activity points at, checked and filled in. */
async function linkedRecords(
  tx: IntelTx,
  workspaceId: string,
  refs: { companyId: string | null; contactId: string | null; dealId: string | null },
): Promise<Outcome<{ companyId: string | null; contactId: string | null; dealId: string | null }>> {
  if (!refs.companyId && !refs.contactId && !refs.dealId) {
    return fail(invalid("Log it on a company, contact or deal"));
  }

  const contact = refs.contactId ? await tx.record("contact", workspaceId, refs.contactId) : null;
  const deal = refs.dealId ? await tx.record("deal", workspaceId, refs.dealId) : null;
  const company = refs.companyId ? await tx.record("company", workspaceId, refs.companyId) : null;

  if (refs.contactId && !contact) return fail(invalid("That contact is not in this workspace"));

  if (refs.dealId && !deal) return fail(invalid("That deal is not in this workspace"));

  if (refs.companyId && !company) return fail(invalid("That company is not in this workspace"));

  // An activity on a contact or deal also shows on their company.
  return ok({
    companyId: refs.companyId ?? deal?.companyId ?? contact?.companyId ?? null,
    contactId: refs.contactId,
    dealId: refs.dealId,
  });
}

/** Moves `last_activity_at` forward on each linked record, never past `now` (future meetings). */
async function touchAll(
  tx: IntelTx,
  workspaceId: string,
  refs: { companyId: string | null; contactId: string | null; dealId: string | null },
  at: Date,
  now: Date,
) {
  if (at > now) return;

  const targets = [
    ["company", refs.companyId],
    ["contact", refs.contactId],
    ["deal", refs.dealId],
  ] as const;

  for (const [table, id] of targets) {
    // oxlint-disable-next-line no-await-in-loop -- at most three rows, in one transaction.
    if (id) await tx.touch(table, workspaceId, id, at);
  }
}

const reject = <A>(message: string): Write<A> => Effect.fail(invalid(message));

/** The shared checks of an email or meeting, and its normalised values. */
const activityInput = (
  input: EmailInput | MeetingInput,
):
  | { ok: false; message: string }
  | {
      ok: true;
      subject: string;
      body: string | null;
      occurredAt: Date;
      externalUrl: string | null;
      refs: { companyId: string | null; contactId: string | null; dealId: string | null };
    } => {
  const subject = text(input.subject, 300);
  const body = optionalProse(input.summary ?? null);
  const occurredAt = instant(input.occurredAt);
  const url = optionalUrl(input.externalUrl ?? null);

  if (!subject.ok) return { ok: false, message: subject.message };

  if (!subject.value) return { ok: false, message: "Give it a subject" };

  if (!body.ok) return { ok: false, message: body.message };

  if (!occurredAt) return { ok: false, message: "That time is not valid" };

  if (!url.ok) return { ok: false, message: url.message };

  const refs = {
    companyId: input.companyId || null,
    contactId: input.contactId || null,
    dealId: input.dealId || null,
  };

  if (refs.companyId && !isCompanyId(refs.companyId)) {
    return { ok: false, message: "That company id is not valid" };
  }

  if (refs.contactId && !isContactId(refs.contactId)) {
    return { ok: false, message: "That contact id is not valid" };
  }

  if (refs.dealId && !isDealId(refs.dealId)) {
    return { ok: false, message: "That deal id is not valid" };
  }

  return {
    ok: true,
    subject: subject.value,
    body: body.value,
    occurredAt,
    externalUrl: url.value,
    refs,
  };
};

/** Trims a brief's short line to 200 characters, or null when blank. */
const short = (value: string | null | undefined) =>
  value?.trim() ? value.trim().slice(0, 200) : null;

/** The parts of a record row a touch needs. */
const ref = (row: { companyId?: string | null; lastActivityAt: Date | null } | null) =>
  row ? { companyId: row.companyId ?? null, lastActivityAt: row.lastActivityAt } : null;

export function makeIntel(store: IntelStore, deps: IntelDependencies = {}): IntelService {
  const now = deps.now ?? (() => new Date());

  /** Membership, the write and the txid in one transaction. */
  const write = <A extends object>(
    actor: IntelActor,
    label: string,
    apply: (workspaceId: string, tx: IntelTx) => Promise<Outcome<A>>,
  ): Write<A> =>
    Effect.tryPromise({
      try: () =>
        store.transact(async (tx): Promise<Outcome<A>> => {
          const workspace = authorizeWorkspace({
            activeWorkspaceId: actor.activeWorkspaceId,
            isMember: actor.activeWorkspaceId
              ? await tx.isMember(actor.activeWorkspaceId, actor.userId)
              : false,
          });

          if (!workspace.ok) {
            return fail(new NoActiveWorkspace({ message: workspace.message }));
          }

          return apply(workspace.value, tx);
        }),
      catch: (cause) => new IntelStoreError({ cause }),
    }).pipe(
      Effect.tapError((error) => Effect.logError(`intel: ${label} failed`, error)),
      Effect.orDie,
      Effect.flatMap(({ result, txid }) =>
        result.ok ? Effect.succeed({ ...result.value, txid }) : Effect.fail(result.error),
      ),
    );

  const upsertActivity = (
    actor: IntelActor,
    key: SyncKey,
    keyValue: string,
    activity: Omit<LoggedActivity, "companyId" | "contactId" | "dealId">,
    refs: { companyId: string | null; contactId: string | null; dealId: string | null },
  ) =>
    write(actor, `log ${activity.type}`, async (workspaceId, tx) => {
      const linked = await linkedRecords(tx, workspaceId, refs);

      if (!linked.ok) return linked;

      const row: LoggedActivity = { ...activity, ...linked.value };
      const existing = await tx.activityBy(workspaceId, key, keyValue);
      const id = existing ?? createId(ID_PREFIXES.activity);

      if (existing) {
        await tx.updateActivity(workspaceId, existing, row);
      } else {
        await tx.insertActivity({
          ...row,
          id,
          workspaceId,
          createdById: actor.userId,
          emailThreadId: key === "emailThreadId" ? keyValue : null,
          calendarEventId: key === "calendarEventId" ? keyValue : null,
        });
      }

      await touchAll(tx, workspaceId, linked.value, row.occurredAt, now());

      return ok({ id, created: existing === null });
    });

  return {
    setEnrichment: (actor, input) => {
      if (input.kind !== "company" && input.kind !== "contact") {
        return reject("Choose a company or a contact");
      }

      const table: EnrichedTable = input.kind;

      if (!(table === "company" ? isCompanyId(input.id) : isContactId(input.id))) {
        return Effect.fail(new NotFound({ message: `${input.kind} not found` }));
      }

      if (!ENRICHMENT_WRITES.has(input.status)) {
        return reject("Status is running, complete, failed or skipped");
      }

      const error = text(input.error, 500);

      if (!error.ok) return reject(error.message);

      return write(actor, "set enrichment", async (workspaceId, tx) => {
        if (!(await tx.record(table, workspaceId, input.id))) {
          return fail(new NotFound({ message: `${input.kind} not found` }));
        }

        const patch: Parameters<IntelTx["setEnrichment"]>[3] = {
          enrichmentStatus: input.status,
          enrichmentError: input.status === "failed" ? (error.value ?? "Research failed") : null,
        };

        if (input.status === "complete") patch.enrichedAt = now();

        await tx.setEnrichment(table, workspaceId, input.id, patch);

        return ok({});
      });
    },

    recordFact: (actor, input) => {
      if (!isContactId(input.contactId)) {
        return Effect.fail(new NotFound({ message: "Contact not found" }));
      }

      if (!isContactFactField(input.field)) return reject("That field can't take a fact");

      const field: ContactFactField = input.field;
      const value = text(input.value, field.endsWith("_url") ? 500 : 200);

      if (!value.ok) return reject(value.message);

      const factValue = value.value;

      if (!factValue) return reject("Give the value");

      if (field.endsWith("_url") && !optionalUrl(factValue).ok) return reject("Give a full URL");

      if (field === "image_url" && !PERSON_PHOTO_PATTERN.test(factValue)) {
        return reject("A photo must be the avatar_url crm__lookup_person returned");
      }

      if (!Number.isFinite(input.score) || input.score < 0 || input.score > 1) {
        return reject("Score is between 0 and 1");
      }

      const band = input.band ?? bandFor(input.score);

      if (!isFactBand(band)) return reject("Band is verified, probable or possible");

      const source = optionalUrl(input.sourceUrl ?? null);

      if (!source.ok) return reject(source.message);

      const evidence = (input.evidence ?? []).slice(0, 10).map((line) => line.slice(0, 500));
      const contactId = input.contactId;

      /** The contact's value now, and whether the agent wrote it. */
      const situation = async (workspaceId: string, tx: IntelTx) => {
        const current = await tx.contactValue(workspaceId, contactId, field);
        const applied = await tx.factValues(workspaceId, contactId, field, "applied");

        // A stored photo's URL is ours, not the source's: any applied photo means the agent's.
        const agentOwned =
          current !== null &&
          (field === "image_url"
            ? applied.length > 0
            : applied.some((earlier) => sameFactValue(earlier, current)));

        return { current, agentOwned };
      };

      const read = write(actor, "read fact", async (workspaceId, tx) =>
        (await tx.record("contact", workspaceId, contactId))
          ? ok(await situation(workspaceId, tx))
          : fail(new NotFound({ message: "Contact not found" })),
      );

      // Jev runs between two transactions, so no transaction waits on the network.
      const judged = (seen: { current: string | null; agentOwned: boolean }) => {
        const facts = { score: input.score, value: factValue, ...seen };

        // Two photo URLs say nothing Jev could read.
        if (!needsJudgement(facts) || !deps.judge || field === "image_url") {
          return Effect.succeed(facts);
        }

        const judge = deps.judge;

        return Effect.promise(() =>
          judge({ field, current: seen.current ?? "", proposed: factValue, evidence }).catch(
            (): FactJudgement => "unsure",
          ),
        ).pipe(Effect.map((judgement) => ({ ...facts, judgement })));
      };

      return read.pipe(
        Effect.flatMap(judged),
        Effect.flatMap((facts) => {
          const decided = factOutcome(facts);

          // A member's own photo stays: accepting a photo would store context.dev's URL, a hotlink.
          const outcome = field === "image_url" && decided === "proposed" ? "kept" : decided;

          if (outcome === "kept" || outcome === "too_unsure") {
            return Effect.succeed<RecordedFact>({ id: null, outcome, txid: null });
          }

          // A photo is copied before the write; one that won't copy is not recorded.
          const stored =
            field === "image_url" && outcome === "applied"
              ? Effect.promise(() =>
                  deps.photos
                    ? deps.photos(contactId, factValue).catch(() => null)
                    : Promise.resolve(null),
                )
              : Effect.succeed(factValue);

          return stored.pipe(
            Effect.flatMap((columnValue) => {
              if (columnValue === null) {
                return Effect.succeed<RecordedFact>({ id: null, outcome: "kept", txid: null });
              }

              const id = createId(ID_PREFIXES.contact_fact);

              return write(
                actor,
                "record fact",
                async (
                  workspaceId,
                  tx,
                ): Promise<Outcome<{ id: string | null; outcome: FactOutcome }>> => {
                  const latest = await situation(workspaceId, tx);

                  // A member who typed a value meanwhile gets the question instead.
                  const changed = latest.current !== facts.current;

                  const status =
                    outcome === "applied" && changed && !latest.agentOwned ? "proposed" : outcome;

                  if (status === "proposed" && field === "image_url")
                    return ok({ id: null, outcome: "kept" });

                  const older = await tx.factIds(workspaceId, contactId, field, "proposed");

                  for (const olderId of older) {
                    // oxlint-disable-next-line no-await-in-loop -- a field has one or two open proposals.
                    await tx.updateFact(workspaceId, olderId, { status: "superseded" });
                  }

                  await tx.insertFact({
                    id,
                    workspaceId,
                    contactId,
                    field,
                    value: factValue,
                    score: input.score,
                    band,
                    evidence,
                    sourceUrl: source.value,
                    status,
                  });

                  if (status === "applied") {
                    await tx.setContactValue(workspaceId, contactId, field, columnValue);
                  }

                  return ok({ id, outcome: status });
                },
              );
            }),
          );
        }),
      );
    },

    decideFact: (actor, id, status) => {
      if (!isContactFactId(id))
        return Effect.fail(new NotFound({ message: "Suggestion not found" }));

      if (!isFactDecision(status)) return reject("Apply or dismiss the suggestion");

      const decision: FactDecision = status;

      return write(actor, "decide fact", async (workspaceId, tx) => {
        const fact = await tx.fact(workspaceId, id);

        if (!fact) return fail(new NotFound({ message: "Suggestion not found" }));

        if (fact.status !== "proposed") return fail(invalid("This suggestion was already decided"));

        await tx.updateFact(workspaceId, id, {
          status: decision,
          decidedById: actor.userId,
          decidedAt: now(),
        });

        return ok({});
      });
    },

    writeBrief: (actor, input) => {
      if (!isContactId(input.contactId)) {
        return Effect.fail(new NotFound({ message: "Contact not found" }));
      }

      const narrative = optionalProse(input.narrative, 4000);

      if (!narrative.ok) return reject(narrative.message);

      if (!narrative.value) return reject("Write the brief");

      const source = optionalUrl(input.sourceUrl ?? null);

      if (!source.ok) return reject(source.message);

      const sections: JsonValue = {
        currentRole: short(input.sections.currentRole),
        tenure: short(input.sections.tenure),
        previousRoles: (input.sections.previousRoles ?? []).slice(0, 20).map((role) => ({
          title: role.title.slice(0, 200),
          company: role.company.slice(0, 200),
          years: short(role.years),
        })),
        seniority: short(input.sections.seniority),
        function: short(input.sections.function),
        location: short(input.sections.location),
      };

      return write(actor, "write brief", async (workspaceId, tx) => {
        if (!(await tx.record("contact", workspaceId, input.contactId))) {
          return fail(new NotFound({ message: "Contact not found" }));
        }

        await tx.putBrief({
          contactId: input.contactId,
          workspaceId,
          narrative: narrative.value ?? "",
          sections,
          sourceUrl: source.value,
          refreshedAt: now(),
        });

        return ok({});
      });
    },

    logEmail: (actor, input) => {
      const threadId = text(input.threadId, 300);

      if (!threadId.ok || !threadId.value) return reject("Give the thread id");

      const checked = activityInput(input);

      if (!checked.ok) return reject(checked.message);

      const lastReplyAt = instant(input.lastReplyAt);
      const messages = input.messages && input.messages > 0 ? Math.round(input.messages) : null;

      const meta: Record<string, JsonValue> = {};

      if (messages) meta["messages"] = messages;

      if (lastReplyAt) meta["lastReplyAt"] = lastReplyAt.toISOString();

      return upsertActivity(
        actor,
        "emailThreadId",
        threadId.value,
        {
          type: "email",
          source: "email",
          subject: checked.subject,
          body: checked.body,
          occurredAt: checked.occurredAt,
          externalUrl: checked.externalUrl,
          meta,
        },
        checked.refs,
      );
    },

    logMeeting: (actor, input) => {
      const eventId = text(input.eventId, 300);

      if (!eventId.ok || !eventId.value) return reject("Give the event id");

      const checked = activityInput(input);

      if (!checked.ok) return reject(checked.message);

      const meta: Record<string, JsonValue> = {};

      if (input.durationMinutes && input.durationMinutes > 0) {
        meta["durationMinutes"] = Math.round(input.durationMinutes);
      }

      if (input.attendees && input.attendees > 0) meta["attendees"] = Math.round(input.attendees);

      return upsertActivity(
        actor,
        "calendarEventId",
        eventId.value,
        {
          type: "meeting",
          source: "calendar",
          subject: checked.subject,
          body: checked.body,
          occurredAt: checked.occurredAt,
          externalUrl: checked.externalUrl,
          meta,
        },
        checked.refs,
      );
    },
  };
}

/** The Prisma field of each fact column. */
const CONTACT_COLUMNS = {
  title: "title",
  image_url: "imageUrl",
  seniority: "seniority",
  function: "function",
  linkedin_url: "linkedinUrl",
  twitter_url: "twitterUrl",
  github_url: "githubUrl",
} as const satisfies Record<ContactFactField, string>;

function intelTx(tx: DbTx): IntelTx {
  const orm = tx.orm.public;

  const record: IntelTx["record"] = async (table, workspaceId, id) => {
    if (table === "company") {
      const row = await orm.Company.where({ id, workspaceId }).first();

      return row ? { companyId: row.id, lastActivityAt: row.lastActivityAt } : null;
    }

    if (table === "contact") return ref(await orm.Contact.where({ id, workspaceId }).first());

    return ref(await orm.Deal.where({ id, workspaceId }).first());
  };

  return {
    isMember: async (workspaceId, userId) =>
      (await orm.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    record,
    setEnrichment: async (table, workspaceId, id, patch) => {
      const values = { ...patch, updatedAt: new Date() };

      await (table === "company"
        ? orm.Company.where({ id, workspaceId }).update(values)
        : orm.Contact.where({ id, workspaceId }).update(values));
    },
    touch: async (table, workspaceId, id, at) => {
      const row = await record(table, workspaceId, id);

      if (!row || (row.lastActivityAt !== null && row.lastActivityAt >= at)) return;

      const values = { lastActivityAt: at, updatedAt: new Date() };

      await (table === "company"
        ? orm.Company.where({ id, workspaceId }).update(values)
        : table === "contact"
          ? orm.Contact.where({ id, workspaceId }).update(values)
          : orm.Deal.where({ id, workspaceId }).update(values));
    },
    fact: async (workspaceId, id) => {
      const row = await orm.ContactFact.where({ id, workspaceId }).first();

      // SAFETY: `evidence` is the JSON this service wrote.
      return row ? { ...row, evidence: (row.evidence ?? null) as JsonValue } : null;
    },
    factIds: async (workspaceId, contactId, field, status) =>
      (
        await orm.ContactFact.where({ workspaceId, contactId, field, status }).select("id").all()
      ).map((row) => row.id),
    factValues: async (workspaceId, contactId, field, status) =>
      (
        await orm.ContactFact.where({ workspaceId, contactId, field, status }).select("value").all()
      ).map((row) => row.value),
    contactValue: async (workspaceId, contactId, field) => {
      const row = await orm.Contact.where({ id: contactId, workspaceId }).first();

      return row ? row[CONTACT_COLUMNS[field]]?.trim() || null : null;
    },
    setContactValue: async (workspaceId, contactId, field, value) => {
      await orm.Contact.where({ id: contactId, workspaceId }).update({
        [CONTACT_COLUMNS[field]]: value,
        updatedAt: new Date(),
      });
    },
    insertFact: async (row) => {
      const now = new Date();

      await orm.ContactFact.create({
        ...row,
        // SAFETY: a JSON array of strings.
        evidence: row.evidence as never,
        observedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    },
    updateFact: async (workspaceId, id, patch) => {
      await orm.ContactFact.where({ id, workspaceId }).update({ ...patch, updatedAt: new Date() });
    },
    putBrief: async (row) => {
      // SAFETY: the sections object this service built.
      const values = { ...row, sections: row.sections as never, updatedAt: new Date() };

      await orm.ContactBrief.upsert({ create: values, update: values });
    },
    activityBy: async (workspaceId, key, value) =>
      (await orm.Activity.where({ workspaceId, [key]: value }).first())?.id ?? null,
    insertActivity: async (row) => {
      const now = new Date();

      // SAFETY: `meta` is a JSON object this service built.
      await orm.Activity.create({
        ...row,
        meta: row.meta as never,
        createdAt: now,
        updatedAt: now,
      });
    },
    updateActivity: async (workspaceId, id, row) => {
      await orm.Activity.where({ id, workspaceId }).update({
        ...row,
        // SAFETY: as above.
        meta: row.meta as never,
        updatedAt: new Date(),
      });
    },
  };
}

/** The Prisma 8 store: ORM writes plus `pg_current_xact_id()` in the same transaction. */
export function prismaIntelStore(db: Db): IntelStore {
  return { transact: (fn) => transactWithTxid(db, (tx) => fn(intelTx(tx))) };
}

export class Intel extends Context.Service<Intel, IntelService>()("@crm/api/services/Intel") {
  static readonly layer = Layer.effect(
    Intel,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const images = yield* Images;

      return makeIntel(prismaIntelStore(yield* Database), {
        judge: Option.isSome(config.aiGatewayApiKey) ? jevFactJudge(gatewayJev()) : null,
        photos: (contactId, source) => images.contactPhoto(contactId, source),
      });
    }),
  ).pipe(Layer.provide([Database.layer, Images.layer]));
}
