import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import { isCompanyId } from "@crm/core/company";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import {
  CONTACT_FIELDS,
  DEAL_FIELDS,
  DEFAULT_DEAL_STAGE,
  type FieldSpec,
  isActivityId,
  isContactId,
  isDealId,
  isDealStage,
  isLoggedActivityType,
  isLosingStage,
  isOpenStage,
  normalizePatch,
  optionalProse,
  optionalText,
  REPORTING_CURRENCY,
  requiredText,
} from "@crm/core/records";
import { type DealBase, dealBase } from "@crm/core/money";
import { Context, Effect, Layer } from "effect";
import { Database } from "./Database.ts";
import { Research } from "./Research.ts";
import { keepPrimaryContact } from "./primary-contact.ts";
import { type DealBaseLookup, dealBaseLookup } from "./Money.ts";
import { pgMoneyStore } from "./money-store.ts";
import { Postgres } from "./Postgres.ts";
import {
  prismaRecordStore,
  type JsonValue,
  type RecordPatch,
  type RecordRow,
  type RecordStore,
  type RecordTx,
} from "./record-store.ts";
import {
  type Actor,
  archivedField,
  checkReferences,
  done,
  notFound,
  type Outcome,
  type PatchInput,
  splitPatch,
  toFields,
  type TxId,
  writer,
} from "./record-writes.ts";

type Write<E = never> = Effect.Effect<TxId, NoActiveWorkspace | Invalid | E>;

type Raw = Readonly<Record<string, string | null | undefined>>;

export interface ContactsService {
  readonly create: (actor: Actor, input: Raw & { id: string; first_name: string }) => Write;
  readonly update: (actor: Actor, id: string, input: PatchInput) => Write<NotFound>;
  readonly remove: (actor: Actor, id: string) => Write<NotFound>;
}

export interface DealsService {
  readonly create: (
    actor: Actor,
    input: Raw & { id: string; name: string; company_id: string },
  ) => Write;
  readonly update: (actor: Actor, id: string, input: PatchInput) => Write<NotFound>;
  readonly remove: (actor: Actor, id: string) => Write<NotFound>;
  readonly attachContact: (
    actor: Actor,
    dealId: string,
    contactId: string,
    role: string | null | undefined,
  ) => Write<NotFound>;
  readonly detachContact: (actor: Actor, dealId: string, contactId: string) => Write<NotFound>;
}

export interface ActivitiesService {
  readonly create: (actor: Actor, input: Raw & { id: string; type: string }) => Write;
  readonly update: (actor: Actor, id: string, input: PatchInput) => Write<NotFound>;
  readonly remove: (actor: Actor, id: string) => Write<NotFound>;
}

export interface RecordsService {
  readonly contacts: ContactsService;
  readonly deals: DealsService;
  readonly activities: ActivitiesService;
}

const invalid = (message: string) => Effect.fail(new Invalid({ message }));

const rejected = (message: string): Outcome<Invalid> => ({
  ok: false,
  error: new Invalid({ message }),
});

/** Optional fields of a create body, normalised by the kind's field specs. */
function createFields(fields: readonly FieldSpec[], input: Raw, columns: string[]) {
  const picked: Record<string, string | null> = {};

  for (const column of columns) {
    const value = input[column];

    if (value !== undefined) picked[column] = value;
  }

  return normalizePatch(fields, picked);
}

/** A column's value as text (numerics come back as text or numbers), or `null`. */
function textOf(value: RecordRow[string]) {
  return value === null || value === undefined ? null : String(value);
}

/** A row's company id, or `null` when it has none. */
function companyOf(row: RecordRow | null) {
  const id = row?.["companyId"];

  return id === null || id === undefined ? null : String(id);
}

/** The columns a stage change sets; `null` for a stage that doesn't exist. */
function stageWrite(stage: string, closedReason: string | null | undefined, at: Date) {
  if (!isDealStage(stage)) return null;

  if (isOpenStage(stage)) return { stage, stageChangedAt: at, closedAt: null, closedReason: null };

  return {
    stage,
    stageChangedAt: at,
    closedAt: at,
    closedReason: isLosingStage(stage) ? (closedReason ?? null) : null,
  };
}

/** A timestamp from the browser, or `fallback` when absent; `null` when it doesn't parse. */
function instant(value: string | null | undefined, fallback: Date | null) {
  if (value === undefined || value === null || value === "") return fallback;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Moves a record's `last_activity_at` forward to `at` (never back). */
async function touchActivity(
  tx: RecordTx,
  workspaceId: string,
  refs: { companyId?: string | null; contactId?: string | null; dealId?: string | null },
  at: Date,
) {
  for (const [table, id] of [
    ["company", refs.companyId],
    ["contact", refs.contactId],
    ["deal", refs.dealId],
  ] as const) {
    if (!id) continue;

    // oxlint-disable-next-line no-await-in-loop -- at most three rows, in one transaction.
    const row = await tx.get(table, workspaceId, id);
    const last = row?.["lastActivityAt"];

    if (row && (!(last instanceof Date) || last < at)) {
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await tx.update(table, workspaceId, id, { lastActivityAt: at });
    }
  }
}

/** Without exchange rates: deals in the reporting currency count as themselves, others don't. */
const reportingOnly: DealBaseLookup = async (_workspaceId, amount, currency) =>
  dealBase(amount, currency, REPORTING_CURRENCY, [], new Date());

/** A deal's stored base amount as ORM fields (ADR 0024). */
const baseFields = (base: DealBase): RecordPatch => ({
  baseAmount: base.baseAmount,
  baseCurrency: base.baseCurrency,
  fxRate: base.fxRate,
  fxRateAt: base.fxRateAt,
});

/** Work that follows a committed write, off the request path. */
export interface RecordEvents {
  /** A contact was added: the agent researches them in the background (ADR 0025). */
  readonly contactCreated?: (actor: Actor, contactId: string) => void;
}

export function makeRecords(
  store: RecordStore,
  now = () => new Date(),
  baseFor: DealBaseLookup = reportingOnly,
  events: RecordEvents = {},
): RecordsService {
  const write = writer(store);

  const contacts: ContactsService = {
    create: (actor, input) => {
      if (!isContactId(input.id)) return invalid("That contact id is not valid");

      const first = requiredText(input.first_name, "First name");

      if (!first.ok) return invalid(first.message);

      const fields = createFields(CONTACT_FIELDS, input, [
        "last_name",
        "email",
        "phone",
        "title",
        "company_id",
        "owner_id",
      ]);

      if (!fields.ok) return invalid(fields.message);

      const ownerId =
        input.owner_id === undefined ? actor.userId : (fields.value["owner_id"] ?? null);

      return write<Invalid>(actor, "create contact", async (workspaceId, tx) => {
        if (await tx.exists("contact", input.id)) {
          return rejected("A contact with this id already exists");
        }

        const problem = await checkReferences(tx, workspaceId, {
          ownerId,
          companyId: fields.value["company_id"],
        });

        if (problem) return problem;

        await tx.insert("contact", {
          ...toFields(fields.value),
          id: input.id,
          workspaceId,
          firstName: first.value,
          ownerId,
        });

        await keepPrimaryContact(tx, workspaceId, {
          contactId: input.id,
          before: null,
          after: fields.value["company_id"] ?? null,
          active: true,
        });

        return done;
      }).pipe(Effect.tap(() => Effect.sync(() => events.contactCreated?.(actor, input.id))));
    },

    update: (actor, id, input) => {
      if (!isContactId(id)) return Effect.fail(notFound("Contact"));

      const { flag: archived, text } = splitPatch(input, "archived");
      const patch = normalizePatch(CONTACT_FIELDS, text);

      if (!patch.ok) return invalid(patch.message);

      return write<NotFound | Invalid>(actor, "update contact", async (workspaceId, tx) => {
        const current = await tx.get("contact", workspaceId, id);

        if (!current) return { ok: false, error: notFound("Contact") };

        const problem = await checkReferences(tx, workspaceId, {
          ownerId: patch.value["owner_id"],
          companyId: patch.value["company_id"],
        });

        if (problem) return problem;

        await tx.update("contact", workspaceId, id, {
          ...toFields(patch.value),
          ...archivedField(archived),
        });

        const company = patch.value["company_id"];

        await keepPrimaryContact(tx, workspaceId, {
          contactId: id,
          before: companyOf(current),
          after: company === undefined ? companyOf(current) : company,
          active: archived === undefined ? !current["archivedAt"] : !archived,
        });

        return done;
      });
    },

    remove: (actor, id) => {
      if (!isContactId(id)) return Effect.fail(notFound("Contact"));

      return write<NotFound>(actor, "remove contact", async (workspaceId, tx) => {
        const current = await tx.get("contact", workspaceId, id);

        if (!current) return { ok: false, error: notFound("Contact") };

        // Hand the primary role on before the row goes.
        await keepPrimaryContact(tx, workspaceId, {
          contactId: id,
          before: companyOf(current),
          after: null,
          active: false,
        });

        await tx.remove("contact", workspaceId, id);

        return done;
      });
    },
  };

  const deals: DealsService = {
    create: (actor, input) => {
      if (!isDealId(input.id)) return invalid("That deal id is not valid");

      const name = requiredText(input.name, "Deal name");

      if (!name.ok) return invalid(name.message);

      if (!isCompanyId(input.company_id)) return invalid("Choose a company");

      const fields = createFields(DEAL_FIELDS, input, [
        "amount",
        "currency",
        "expected_close_date",
        "owner_id",
      ]);

      if (!fields.ok) return invalid(fields.message);

      const stage = input.stage ?? DEFAULT_DEAL_STAGE;

      if (!isDealStage(stage)) return invalid("Choose a stage");

      if (isLosingStage(stage)) return invalid("A new deal can't start lost");

      const ownerId =
        input.owner_id === undefined ? actor.userId : (fields.value["owner_id"] ?? null);

      return write<Invalid>(actor, "create deal", async (workspaceId, tx) => {
        if (await tx.exists("deal", input.id))
          return rejected("A deal with this id already exists");

        const problem = await checkReferences(tx, workspaceId, {
          ownerId,
          companyId: input.company_id,
        });

        if (problem) return problem;

        const at = now();
        const currency = fields.value["currency"] ?? REPORTING_CURRENCY;
        const base = await baseFor(workspaceId, fields.value["amount"] ?? null, currency);

        await tx.insert("deal", {
          ...toFields(fields.value),
          id: input.id,
          workspaceId,
          name: name.value,
          companyId: input.company_id,
          ownerId,
          currency,
          ...stageWrite(stage, null, at),
          ...baseFields(base),
        });

        return done;
      });
    },

    update: (actor, id, input) => {
      if (!isDealId(id)) return Effect.fail(notFound("Deal"));

      const { flag: archived, text } = splitPatch(input, "archived");
      const { stage, closed_reason: reasonInput, ...raw } = text;
      const patch = normalizePatch(DEAL_FIELDS, raw);

      if (!patch.ok) return invalid(patch.message);

      if (stage !== undefined && (stage === null || !isDealStage(stage))) {
        return invalid("Choose a stage");
      }

      const reason = optionalText(reasonInput ?? null, 500);

      if (!reason.ok) return invalid(reason.message);

      if (stage && isLosingStage(stage) && !reason.value) {
        return invalid("Say why the deal closed");
      }

      return write<NotFound | Invalid>(actor, "update deal", async (workspaceId, tx) => {
        const current = await tx.get("deal", workspaceId, id);

        if (!current) return { ok: false, error: notFound("Deal") };

        const problem = await checkReferences(tx, workspaceId, {
          ownerId: patch.value["owner_id"],
          companyId: patch.value["company_id"],
        });

        if (problem) return problem;

        const at = now();
        const from = String(current["stage"]);

        const moved =
          stage !== undefined && stage !== from ? stageWrite(stage, reason.value, at) : null;

        const changes: RecordPatch = {
          ...toFields(patch.value),
          ...archivedField(archived),
          ...moved,
        };

        // A reason edited without a stage change.
        if (!moved && reasonInput !== undefined) changes["closedReason"] = reason.value;

        if (moved) changes["lastActivityAt"] = at;

        // A new amount or currency is converted again at today's rate.
        if (patch.value["amount"] !== undefined || patch.value["currency"] !== undefined) {
          const amount =
            patch.value["amount"] === undefined ? textOf(current["amount"]) : patch.value["amount"];

          const currency =
            patch.value["currency"] ?? textOf(current["currency"]) ?? REPORTING_CURRENCY;

          Object.assign(changes, baseFields(await baseFor(workspaceId, amount, currency)));
        }

        await tx.update("deal", workspaceId, id, changes);

        if (moved && stage) {
          const meta: JsonValue = moved.closedReason
            ? { from, to: stage, reason: moved.closedReason }
            : { from, to: stage };

          await tx.insert("activity", {
            id: createActivityId(),
            workspaceId,
            type: "stage_change",
            occurredAt: at,
            dealId: id,
            companyId: current["companyId"],
            createdById: actor.userId,
            meta,
          });
          await touchActivity(tx, workspaceId, { companyId: companyOf(current) }, at);
        }

        return done;
      });
    },

    remove: (actor, id) => {
      if (!isDealId(id)) return Effect.fail(notFound("Deal"));

      return write<NotFound>(actor, "remove deal", async (workspaceId, tx) =>
        (await tx.remove("deal", workspaceId, id)) ? done : { ok: false, error: notFound("Deal") },
      );
    },

    attachContact: (actor, dealId, contactId, roleInput) => {
      if (!isDealId(dealId)) return Effect.fail(notFound("Deal"));

      if (!isContactId(contactId)) return Effect.fail(notFound("Contact"));

      const role = optionalText(roleInput ?? null, 80);

      if (!role.ok) return invalid(role.message);

      return write<NotFound>(actor, "attach deal contact", async (workspaceId, tx) => {
        if (!(await tx.get("deal", workspaceId, dealId))) {
          return { ok: false, error: notFound("Deal") };
        }

        if (!(await tx.get("contact", workspaceId, contactId))) {
          return { ok: false, error: notFound("Contact") };
        }

        await tx.putDealContact({ dealId, contactId, workspaceId, role: role.value });

        return done;
      });
    },

    detachContact: (actor, dealId, contactId) =>
      write<NotFound>(actor, "detach deal contact", async (workspaceId, tx) =>
        (await tx.removeDealContact(workspaceId, dealId, contactId))
          ? done
          : { ok: false, error: notFound("Deal contact") },
      ),
  };

  const activities: ActivitiesService = {
    create: (actor, input) => {
      if (!isActivityId(input.id)) return invalid("That activity id is not valid");

      if (!isLoggedActivityType(input.type))
        return invalid("Choose a note, call, email, meeting or task");

      const subject = optionalText(input.subject ?? null, 300);
      const body = optionalProse(input.body ?? null);

      if (!subject.ok) return invalid(subject.message);

      if (!body.ok) return invalid(body.message);

      if (!subject.value && !body.value) return invalid("Write something first");

      const occurredAt = instant(input.occurred_at, now());
      const dueAt = instant(input.due_at, null);

      if (!occurredAt) return invalid("That time is not valid");

      if (input.due_at && !dueAt) return invalid("That due date is not valid");

      const refs = {
        companyId: input.company_id || null,
        contactId: input.contact_id || null,
        dealId: input.deal_id || null,
      };

      if (!refs.companyId && !refs.contactId && !refs.dealId) {
        return invalid("Log it on a company, contact or deal");
      }

      return write<Invalid>(actor, "create activity", async (workspaceId, tx) => {
        if (await tx.exists("activity", input.id)) return rejected("This activity already exists");

        const problem = await checkReferences(tx, workspaceId, refs);

        if (problem) return problem;

        // An activity on a contact or deal also shows on their company.
        const contact = refs.contactId
          ? await tx.get("contact", workspaceId, refs.contactId)
          : null;

        const deal = refs.dealId ? await tx.get("deal", workspaceId, refs.dealId) : null;

        const companyId = refs.companyId ?? companyOf(deal) ?? companyOf(contact);

        await tx.insert("activity", {
          id: input.id,
          workspaceId,
          type: input.type,
          subject: subject.value,
          body: body.value,
          occurredAt,
          dueAt: input.type === "task" ? dueAt : null,
          companyId,
          contactId: refs.contactId,
          dealId: refs.dealId,
          createdById: actor.userId,
        });

        await touchActivity(tx, workspaceId, { ...refs, companyId }, occurredAt);

        return done;
      });
    },

    update: (actor, id, request) => {
      if (!isActivityId(id)) return Effect.fail(notFound("Activity"));

      const { flag: completed, text: input } = splitPatch(request, "completed");
      const patch: RecordPatch = {};

      if (input.subject !== undefined) {
        const subject = optionalText(input.subject, 300);

        if (!subject.ok) return invalid(subject.message);

        patch["subject"] = subject.value;
      }

      if (input.body !== undefined) {
        const body = optionalProse(input.body);

        if (!body.ok) return invalid(body.message);

        patch["body"] = body.value;
      }

      if (input.due_at !== undefined) {
        const dueAt = instant(input.due_at, null);

        if (input.due_at && !dueAt) return invalid("That due date is not valid");

        patch["dueAt"] = dueAt;
      }

      if (completed !== undefined) patch["completedAt"] = completed ? now() : null;

      return write<NotFound>(actor, "update activity", async (workspaceId, tx) =>
        (await tx.update("activity", workspaceId, id, patch))
          ? done
          : { ok: false, error: notFound("Activity") },
      );
    },

    remove: (actor, id) => {
      if (!isActivityId(id)) return Effect.fail(notFound("Activity"));

      return write<NotFound>(actor, "remove activity", async (workspaceId, tx) =>
        (await tx.remove("activity", workspaceId, id))
          ? done
          : { ok: false, error: notFound("Activity") },
      );
    },
  };

  return { contacts, deals, activities };
}

/** The server makes ids only for activity it writes itself (stage changes). */
function createActivityId() {
  return createId(ID_PREFIXES.activity);
}

export class Records extends Context.Service<Records, RecordsService>()(
  "@crm/api/services/Records",
) {
  static readonly layer = Layer.effect(
    Records,
    Effect.gen(function* () {
      const rates = dealBaseLookup(pgMoneyStore(yield* Postgres));
      const research = yield* Research;

      return makeRecords(prismaRecordStore(yield* Database), undefined, rates, {
        contactCreated: (actor, id) => research.start(actor, "contact", id),
      });
    }),
  ).pipe(Layer.provide([Database.layer, Postgres.layer, Research.layer]));
}
