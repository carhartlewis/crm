import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import type { Db } from "@crm/core/db";
import { Context, Effect, Layer, Schema } from "effect";
import {
  type CompanyPatch,
  type NewCompany,
  authorizeWorkspace,
  parseCompanyId,
  parseCompanyPatch,
  parseNewCompany,
} from "./companies-rules.ts";
import { Database } from "./Database.ts";
import { type DbTx, transactWithTxid } from "./txid.ts";
import { Memory } from "./Memory.ts";

/** Who is acting: the session user and the session's (unverified) active workspace. */
export interface Actor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

/** Row operations inside one transaction. Every write is scoped by workspace. */
export interface CompanyTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  insert(row: NewCompany & { workspaceId: string; ownerId: string }): Promise<void>;
  /** `false` when no row has this id in this workspace. */
  update(workspaceId: string, id: string, patch: CompanyPatch): Promise<boolean>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}

/** Runs `fn` in one Postgres transaction and returns its result with that transaction's id. */
export interface CompanyStore {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  transact<A>(fn: (tx: CompanyTx) => Promise<A>): Promise<{ result: A; txid: number }>;
}

export class CompanyStoreError extends Schema.TaggedError<CompanyStoreError>()(
  "CompanyStoreError",
  { cause: Schema.Defect() },
) {}

type TxId = { readonly txid: number };

export interface CompaniesService {
  /** The verified workspace for the shape proxy; `requested` must equal the active workspace. */
  readonly workspaceFor: (
    actor: Actor,
    requested: string | null,
  ) => Effect.Effect<string, NoActiveWorkspace>;
  readonly create: (
    actor: Actor,
    input: { id: string; name: string; domain: string | null },
  ) => Effect.Effect<TxId, NoActiveWorkspace | Invalid>;
  readonly update: (
    actor: Actor,
    id: string,
    input: { name?: string | undefined; domain?: string | null | undefined },
  ) => Effect.Effect<TxId, NoActiveWorkspace | Invalid | NotFound>;
  readonly remove: (actor: Actor, id: string) => Effect.Effect<TxId, NoActiveWorkspace | NotFound>;
}

const notFound = () => new NotFound({ message: "Company not found" });

type Outcome<E> = { ok: true } | { ok: false; error: E };

/** Runs a store call; a store failure is logged and becomes a defect (500). */
const run = <A>(label: string, fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new CompanyStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`companies: ${label} failed`, error)),
    Effect.orDie,
  );

/** Work that follows a committed write, off the request path (company memory, ADR 0014). */
export interface CompanyEvents {
  /** A company was created, or its domain changed. */
  readonly researched?: (workspaceId: string, companyId: string) => void;
  readonly removed?: (workspaceId: string, companyId: string) => void;
}

/** The companies use cases over an injected store. */
export function makeCompanies(store: CompanyStore, events: CompanyEvents = {}): CompaniesService {
  /** Membership check, the write and the txid all happen in one transaction. */
  const write = <E>(
    actor: Actor,
    label: string,
    apply: (workspaceId: string, tx: CompanyTx) => Promise<Outcome<E>>,
  ) =>
    Effect.gen(function* () {
      const { result, txid } = yield* run(label, () =>
        store.transact(async (tx): Promise<Outcome<E | NoActiveWorkspace>> => {
          const workspace = authorizeWorkspace({
            activeWorkspaceId: actor.activeWorkspaceId,
            isMember: actor.activeWorkspaceId
              ? await tx.isMember(actor.activeWorkspaceId, actor.userId)
              : false,
          });

          if (!workspace.ok) {
            return { ok: false, error: new NoActiveWorkspace({ message: workspace.message }) };
          }

          return apply(workspace.value, tx);
        }),
      );

      if (!result.ok) return yield* Effect.fail(result.error);

      return { txid };
    });

  return {
    workspaceFor: Effect.fn("Companies.workspaceFor")(function* (actor, requested) {
      const isMember =
        actor.activeWorkspaceId !== null && actor.activeWorkspaceId === requested
          ? yield* run("membership", () =>
              store.isMember(actor.activeWorkspaceId ?? "", actor.userId),
            )
          : false;

      const workspace = authorizeWorkspace({
        activeWorkspaceId: actor.activeWorkspaceId,
        requested,
        isMember,
      });

      if (!workspace.ok) return yield* new NoActiveWorkspace({ message: workspace.message });

      return workspace.value;
    }),

    create: (actor, input) => {
      const parsed = parseNewCompany(input);

      if (!parsed.ok) return Effect.fail(new Invalid({ message: parsed.message }));

      return write<Invalid>(actor, "create", async (workspaceId, tx) => {
        if (await tx.exists(parsed.value.id)) {
          return {
            ok: false,
            error: new Invalid({ message: "A company with this id already exists" }),
          };
        }

        await tx.insert({ ...parsed.value, workspaceId, ownerId: actor.userId });

        return { ok: true };
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            if (parsed.value.domain && actor.activeWorkspaceId) {
              events.researched?.(actor.activeWorkspaceId, parsed.value.id);
            }
          }),
        ),
      );
    },

    update: (actor, id, input) => {
      const parsedId = parseCompanyId(id);

      if (!parsedId.ok) return Effect.fail(notFound());

      const patch = parseCompanyPatch(input);

      if (!patch.ok) return Effect.fail(new Invalid({ message: patch.message }));

      return write<NotFound>(actor, "update", async (workspaceId, tx) =>
        (await tx.update(workspaceId, parsedId.value, patch.value))
          ? { ok: true }
          : { ok: false, error: notFound() },
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            if (patch.value.domain && actor.activeWorkspaceId) {
              events.researched?.(actor.activeWorkspaceId, parsedId.value);
            }
          }),
        ),
      );
    },

    remove: (actor, id) => {
      const parsedId = parseCompanyId(id);

      if (!parsedId.ok) return Effect.fail(notFound());

      return write<NotFound>(actor, "remove", async (workspaceId, tx) =>
        (await tx.remove(workspaceId, parsedId.value))
          ? { ok: true }
          : { ok: false, error: notFound() },
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            if (actor.activeWorkspaceId) events.removed?.(actor.activeWorkspaceId, parsedId.value);
          }),
        ),
      );
    },
  };
}

function companyTx(tx: DbTx): CompanyTx {
  const companies = tx.orm.public.Company;

  return {
    isMember: async (workspaceId, userId) =>
      (await tx.orm.public.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    exists: async (id) => (await companies.where({ id }).first()) !== null,
    insert: async (row) => {
      await companies.create({
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        domain: row.domain,
        ownerId: row.ownerId,
      });
    },
    // `updatedAt` is always written, so even an empty patch changes the row and the client's
    // txid shows up in the shape stream (a transaction with no row change never would).
    update: async (workspaceId, id, patch) =>
      (await companies.where({ id, workspaceId }).update({ ...patch, updatedAt: new Date() })) !==
      null,
    remove: async (workspaceId, id) =>
      (await companies.where({ id, workspaceId }).delete()) !== null,
  };
}

/** The Prisma 8 store: ORM writes plus `pg_current_xact_id()` in the same transaction. */
export function prismaCompanyStore(db: Db): CompanyStore {
  return {
    isMember: async (workspaceId, userId) =>
      (await db.orm.public.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    transact: (fn) => transactWithTxid(db, (tx) => fn(companyTx(tx))),
  };
}

export class Companies extends Context.Service<Companies, CompaniesService>()(
  "@crm/api/services/Companies",
) {
  static readonly layer = Layer.effect(
    Companies,
    Effect.gen(function* () {
      const memory = yield* Memory;

      return makeCompanies(prismaCompanyStore(yield* Database), {
        researched: (workspaceId, id) => void memory.researchCompany(workspaceId, id),
        removed: (workspaceId, id) => void memory.companyRemoved(workspaceId, id),
      });
    }),
  ).pipe(Layer.provide([Database.layer, Memory.layer]));
}
