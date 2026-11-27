import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import { Effect, Schema } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import type { RecordRow, RecordStore, RecordTx } from "./record-store.ts";

/** Who is acting: the session user and the session's (unverified) active workspace. */
export interface Actor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

export type TxId = { readonly txid: number };

export class RecordStoreError extends Schema.TaggedError<RecordStoreError>()("RecordStoreError", {
  cause: Schema.Defect(),
}) {}

export type Outcome<E> = { ok: true } | { ok: false; error: E };

export const done: Outcome<never> = { ok: true };

/** Runs a store call; a store failure is logged and becomes a defect (500). */
export const run = <A>(label: string, fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new RecordStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`records: ${label} failed`, error)),
    Effect.orDie,
  );

/**
 * One write: the membership check, `apply` and the txid all happen in one transaction, and
 * `apply` receives the verified workspace.
 */
export function writer(store: RecordStore) {
  return <E>(
    actor: Actor,
    label: string,
    apply: (workspaceId: string, tx: RecordTx) => Promise<Outcome<E>>,
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

      return { txid } satisfies TxId;
    });
}

/** A PATCH body as the HttpApi schema decoded it: text columns plus boolean flags. */
export type PatchInput = Readonly<Record<string, string | boolean | null | undefined>>;

/**
 * Splits a PATCH body into its boolean flag (`archived`, `completed`) and its text columns. The
 * schema already typed every column as text, so anything else is dropped.
 */
export function splitPatch(input: PatchInput, flag: string) {
  const text: Record<string, string | null | undefined> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key !== flag && value !== true && value !== false) text[key] = value;
  }

  const raw = input[flag];

  return { flag: raw === true || raw === false ? raw : undefined, text };
}

/** `owner_id` → `ownerId`: synced columns to the ORM's field names. */
export function camelCase(column: string) {
  return column.replaceAll(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toFields(patch: RecordRow): RecordRow {
  return Object.fromEntries(
    Object.entries(patch).map(([column, value]) => [camelCase(column), value]),
  );
}

const invalid = (message: string) => ({ ok: false, error: new Invalid({ message }) }) as const;

/**
 * Checks the ids a patch points at: an owner must be a member of the workspace, a company or
 * contact must be a row in it. The first problem, or `null` when every reference holds.
 */
export async function checkReferences(
  tx: RecordTx,
  workspaceId: string,
  refs: {
    readonly ownerId?: string | null | undefined;
    readonly companyId?: string | null | undefined;
    readonly contactId?: string | null | undefined;
    readonly dealId?: string | null | undefined;
  },
) {
  if (refs.ownerId && !(await tx.isMember(workspaceId, refs.ownerId))) {
    return invalid("The owner must be a member of this workspace");
  }

  if (refs.companyId && !(await tx.get("company", workspaceId, refs.companyId))) {
    return invalid("That company is not in this workspace");
  }

  if (refs.contactId && !(await tx.get("contact", workspaceId, refs.contactId))) {
    return invalid("That contact is not in this workspace");
  }

  if (refs.dealId && !(await tx.get("deal", workspaceId, refs.dealId))) {
    return invalid("That deal is not in this workspace");
  }

  return null;
}

export const notFound = (kind: string) => new NotFound({ message: `${kind} not found` });

/** `archived: true` stamps now, `false` clears it, absent leaves it. */
export function archivedField(archived: boolean | undefined) {
  if (archived === undefined) return {};

  return { archivedAt: archived ? new Date() : null };
}
