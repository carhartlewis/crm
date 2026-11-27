import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import {
  canEditView,
  isSavedViewEntity,
  isSavedViewId,
  viewName,
  viewQuery,
} from "@crm/core/views";
import { Context, Effect, Layer } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import { Postgres } from "./Postgres.ts";
import { type Actor, notFound, run, type TxId } from "./record-writes.ts";
import {
  pgSavedViewStore,
  type SavedViewPatch,
  type SavedViewStore,
  type SavedViewTx,
} from "./saved-view-store.ts";

type Write<E = never> = Effect.Effect<TxId, NoActiveWorkspace | Invalid | E>;

export interface SavedViewsService {
  readonly create: (
    actor: Actor,
    input: {
      id: string;
      entity: string;
      name: string;
      query: string;
      shared?: boolean | undefined;
    },
  ) => Write;
  readonly update: (
    actor: Actor,
    id: string,
    input: {
      name?: string | undefined;
      query?: string | undefined;
      shared?: boolean | undefined;
    },
  ) => Write<NotFound>;
  readonly remove: (actor: Actor, id: string) => Write<NotFound>;
}

type Outcome<E> = { ok: true } | { ok: false; error: E };

const done: Outcome<never> = { ok: true };

const refuse = (message: string): Outcome<Invalid> => ({
  ok: false,
  error: new Invalid({ message }),
});

const invalid = (message: string) => Effect.fail(new Invalid({ message }));

/** The view when the caller may change it; otherwise it is not found. */
async function editable(tx: SavedViewTx, workspaceId: string, id: string, userId: string) {
  const view = await tx.get(workspaceId, id);

  return view && canEditView(view, userId) ? view : null;
}

/**
 * Saved views: the caller owns what they create. A personal view is seen and changed only by
 * its owner (to anyone else it doesn't exist); a shared one by every member, though only its
 * owner decides who sees it.
 */
export function makeSavedViews(store: SavedViewStore): SavedViewsService {
  const write = <E>(
    actor: Actor,
    label: string,
    apply: (workspaceId: string, tx: SavedViewTx) => Promise<Outcome<E>>,
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

  return {
    create: (actor, input) => {
      if (!isSavedViewId(input.id)) return invalid("That view id is not valid");

      if (!isSavedViewEntity(input.entity))
        return invalid("Views are for companies, contacts and deals");

      const name = viewName(input.name);

      if (!name.ok) return invalid(name.message);

      const query = viewQuery(input.query);

      if (!query.ok) return invalid(query.message);

      return write<Invalid>(actor, "create saved view", async (workspaceId, tx) => {
        if (await tx.exists(input.id)) return refuse("A view with this id already exists");

        await tx.insert({
          id: input.id,
          workspaceId,
          ownerId: actor.userId,
          entity: input.entity,
          name: name.value,
          shared: input.shared ?? false,
          query: query.value,
        });

        return done;
      });
    },

    update: (actor, id, input) => {
      if (!isSavedViewId(id)) return Effect.fail(notFound("View"));

      const patch: { -readonly [K in keyof SavedViewPatch]: SavedViewPatch[K] } = {};

      if (input.name !== undefined) {
        const name = viewName(input.name);

        if (!name.ok) return invalid(name.message);

        patch.name = name.value;
      }

      if (input.query !== undefined) {
        const query = viewQuery(input.query);

        if (!query.ok) return invalid(query.message);

        patch.query = query.value;
      }

      if (input.shared !== undefined) patch.shared = input.shared;

      return write<NotFound | Invalid>(actor, "update saved view", async (workspaceId, tx) => {
        const view = await editable(tx, workspaceId, id, actor.userId);

        if (!view) return { ok: false, error: notFound("View") };

        if (
          patch.shared !== undefined &&
          patch.shared !== view.shared &&
          view.ownerId !== actor.userId
        ) {
          return refuse("Only the person who made this view can change who sees it");
        }

        await tx.update(workspaceId, id, patch);

        return done;
      });
    },

    remove: (actor, id) => {
      if (!isSavedViewId(id)) return Effect.fail(notFound("View"));

      return write<NotFound>(actor, "remove saved view", async (workspaceId, tx) => {
        if (!(await editable(tx, workspaceId, id, actor.userId))) {
          return { ok: false, error: notFound("View") };
        }

        await tx.remove(workspaceId, id);

        return done;
      });
    },
  };
}

export class SavedViews extends Context.Service<SavedViews, SavedViewsService>()(
  "@crm/api/services/SavedViews",
) {
  static readonly layer = Layer.effect(
    SavedViews,
    Effect.gen(function* () {
      return makeSavedViews(pgSavedViewStore(yield* Postgres));
    }),
  ).pipe(Layer.provide(Postgres.layer));
}
