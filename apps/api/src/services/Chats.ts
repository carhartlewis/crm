import {
  AgentUnavailable,
  type ChatHistory,
  Forbidden,
  Invalid,
  NoActiveWorkspace,
  NotFound,
} from "@crm/core/api";
import {
  isChatId,
  isSidebarId,
  isSpaceColor,
  isSpaceId,
  normalizeChatTitle,
  normalizeSpaceName,
  parseSidebarLayout,
  type FolderInput,
  type SidebarLayout,
} from "@crm/core/chat";
import type { Db } from "@crm/core/db";
import type { Kv as KvStore } from "@crm/core/kv";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import { type AgentCaller, type ChatAgent, eveChatAgent } from "./chat-agent.ts";
import { Database } from "./Database.ts";
import { Kv } from "./Kv.ts";
import { type DbTx, transactWithTxid } from "./txid.ts";

/** Who is acting: the session user (as the agent sees them) and the session's active workspace. */
export interface ChatActor extends AgentCaller {
  readonly activeWorkspaceId: string | null;
}

export interface ChatRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly spaceId: string | null;
  readonly createdById: string | null;
  readonly title: string;
  readonly sessionId: string;
}

export interface SpaceRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly color: string;
  readonly createdById: string | null;
}

/** The chat columns a member may change. */
export interface ChatPatch {
  title?: string;
  spaceId?: string | null;
}

/** The space columns its maker (or an admin) may change. */
export interface SpacePatch {
  name?: string;
  color?: string;
}

/** Row operations inside one transaction. */
export interface ChatTx {
  /** The member's role (`owner`, `admin`, `member`), or null for a non-member. */
  role(workspaceId: string, userId: string): Promise<string | null>;
  chat(id: string): Promise<ChatRow | null>;
  insertChat(row: ChatRow): Promise<void>;
  updateChat(id: string, patch: ChatPatch): Promise<void>;
  deleteChat(id: string): Promise<void>;
  space(id: string): Promise<SpaceRow | null>;
  insertSpace(row: SpaceRow): Promise<void>;
  updateSpace(id: string, patch: SpacePatch): Promise<void>;
  deleteSpace(id: string): Promise<void>;
  /** The id of the user's sidebar row in the workspace, if there is one. */
  sidebarId(workspaceId: string, userId: string): Promise<string | null>;
  saveSidebar(row: {
    id: string;
    workspaceId: string;
    userId: string;
    layout: SidebarLayout;
  }): Promise<void>;
}

export interface ChatStore {
  transact<A>(fn: (tx: ChatTx) => Promise<A>): Promise<{ result: A; txid: number }>;
  role(workspaceId: string, userId: string): Promise<string | null>;
  chat(id: string): Promise<ChatRow | null>;
  /** Marks a message sent now (Recents order). */
  touch(id: string): Promise<void>;
}

export class ChatStoreError extends Schema.TaggedError<ChatStoreError>()("ChatStoreError", {
  cause: Schema.Defect(),
}) {}

type TxId = { readonly txid: number };

type Failure = NotFound | NoActiveWorkspace | Invalid | Forbidden | AgentUnavailable;

type Outcome<A> = { ok: true; value: A } | { ok: false; error: Failure };

/** How long a prewarmed session waits for its chat. */
export const PREWARM_TTL_SECONDS = 10 * 60;

/** How long a chat's events stay in Redis after the last read. */
export const HISTORY_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Larger histories are read from eve each time instead of cached. */
export const HISTORY_CACHE_MAX_BYTES = 2_000_000;

const prewarmKey = (workspaceId: string, userId: string) => `chat:prewarm:${workspaceId}:${userId}`;
const historyKey = (chatId: string) => `chat:history:${chatId}`;

const notFound = () => new NotFound({ message: "Chat not found" });
const noWorkspace = () => new NoActiveWorkspace({ message: "Open a workspace first" });

const agentDown = () =>
  new AgentUnavailable({ message: "The assistant isn't available right now. Try again soon." });

const ok = <A>(value: A): Outcome<A> => ({ ok: true, value });
const fail = (error: Failure): Outcome<never> => ({ ok: false, error });

/** A private chat is its starter's; a shared chat is the whole workspace's. */
export const canSee = (chat: ChatRow, userId: string) =>
  chat.spaceId !== null || chat.createdById === userId;

const isManager = (role: string | null) => role === "owner" || role === "admin";

const CachedHistory = Schema.fromJsonString(
  Schema.Struct({ streamIndex: Schema.Number, events: Schema.Array(Schema.Unknown) }),
);

const decodeCached = Schema.decodeUnknownOption(CachedHistory);

export interface ChatsService {
  readonly prewarm: (actor: ChatActor) => Effect.Effect<void, Failure>;
  readonly create: (
    actor: ChatActor,
    input: { id: string; title: string; spaceId: string | null },
  ) => Effect.Effect<{ txid: number; sessionId: string }, Failure>;
  readonly update: (
    actor: ChatActor,
    id: string,
    input: { title?: string | undefined; spaceId?: string | null | undefined },
  ) => Effect.Effect<TxId, Failure>;
  readonly remove: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  readonly history: (actor: ChatActor, id: string) => Effect.Effect<ChatHistory, Failure>;
  readonly createSpace: (
    actor: ChatActor,
    input: { id: string; name: string; color: string },
  ) => Effect.Effect<TxId, Failure>;
  readonly updateSpace: (
    actor: ChatActor,
    id: string,
    input: { name?: string | undefined; color?: string | undefined },
  ) => Effect.Effect<TxId, Failure>;
  readonly removeSpace: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  readonly saveSidebar: (
    actor: ChatActor,
    input: { id: string; pinned: readonly string[]; folders: readonly FolderInput[] },
  ) => Effect.Effect<TxId, Failure>;
  /**
   * The agent proxy: forwards `path` (`/eve/v1/session/<id>…`) when the caller may see the chat
   * and the path names the chat's own session. Not found otherwise, so ids leak nothing.
   */
  readonly forward: (
    actor: ChatActor,
    chatId: string,
    path: string,
    request: Request,
  ) => Effect.Effect<Response, Failure>;
}

/** The path a proxied request may take: one session's routes, never session creation. */
export function proxiedSession(path: string): string | undefined {
  const match = /^\/eve\/v1\/session\/([^/]+)(?:\/stream)?$/.exec(path);

  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/** Runs a store or agent call; a store failure is logged and becomes a defect (500). */
const run = <A>(label: string, fn: () => Promise<Outcome<A>>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new ChatStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`chats: ${label} failed`, error)),
    Effect.orDie,
    Effect.flatMap((result) =>
      result.ok ? Effect.succeed(result.value) : Effect.fail(result.error),
    ),
  );

/** A space in the workspace, or null for Private; refuses anything else. */
const spaceIn = async (tx: ChatTx, workspaceId: string, spaceId: string | null) => {
  if (spaceId === null) return true;

  const space = isSpaceId(spaceId) ? await tx.space(spaceId) : null;

  return space?.workspaceId === workspaceId;
};

/** The caller as the agent sees them, acting in `workspaceId` (the chat's workspace). */
const callerIn = (actor: ChatActor, workspaceId: string | null): AgentCaller => ({
  id: actor.id,
  name: actor.name,
  email: actor.email,
  workspaceId,
});

/** The chats use cases over an injected store, agent and KV (Redis in production). */
export function makeChats(store: ChatStore, agent: ChatAgent | null, kv: KvStore): ChatsService {
  /** Membership, the write and the txid in one transaction. */
  const write = (
    actor: ChatActor,
    label: string,
    apply: (workspaceId: string, role: string, tx: ChatTx) => Promise<Outcome<void>>,
  ) =>
    run(label, async () => {
      const workspaceId = actor.activeWorkspaceId;

      if (!workspaceId) return fail(noWorkspace());

      const { result, txid } = await store.transact(async (tx) => {
        const role = await tx.role(workspaceId, actor.id);

        return role === null ? fail(noWorkspace()) : apply(workspaceId, role, tx);
      });

      return result.ok ? ok({ txid }) : result;
    });

  /** A chat the actor may see in their active workspace. */
  const visibleChat = async (actor: ChatActor, id: string): Promise<Outcome<ChatRow>> => {
    const workspaceId = actor.activeWorkspaceId;

    if (!workspaceId || (await store.role(workspaceId, actor.id)) === null) {
      return fail(noWorkspace());
    }

    const chat = isChatId(id) ? await store.chat(id) : null;

    return chat && chat.workspaceId === workspaceId && canSee(chat, actor.id)
      ? ok(chat)
      : fail(notFound());
  };

  const createSession = async (actor: ChatActor, workspaceId: string) => {
    if (!agent) return null;

    const prewarmed = await kv.take(prewarmKey(workspaceId, actor.id));

    return (
      prewarmed ?? agent.createSession(callerIn(actor, actor.activeWorkspaceId)).catch(() => null)
    );
  };

  return {
    prewarm: (actor) =>
      run("prewarm", async () => {
        const workspaceId = actor.activeWorkspaceId;

        if (!workspaceId || (await store.role(workspaceId, actor.id)) === null) {
          return fail(noWorkspace());
        }

        if (!agent) return fail(agentDown());

        const key = prewarmKey(workspaceId, actor.id);

        if ((await kv.get(key)) !== null) return ok(undefined);

        const sessionId = await agent
          .createSession(callerIn(actor, actor.activeWorkspaceId))
          .catch(() => null);

        if (sessionId === null) return fail(agentDown());

        await kv.set(key, sessionId, PREWARM_TTL_SECONDS);

        return ok(undefined);
      }),

    create: (actor, input) =>
      Effect.gen(function* () {
        if (!isChatId(input.id))
          return yield* new Invalid({ message: "That chat id is not valid" });

        const title = normalizeChatTitle(input.title);

        if (!title.ok) return yield* new Invalid({ message: title.message });

        const workspaceId = actor.activeWorkspaceId;

        if (!workspaceId) return yield* noWorkspace();

        const sessionId = yield* run("session", async () => {
          const id = await createSession(actor, workspaceId);

          return id === null ? fail(agentDown()) : ok(id);
        });

        const { txid } = yield* write(actor, "create", async (_, __, tx) => {
          if (await tx.chat(input.id)) {
            return fail(new Invalid({ message: "A chat with this id already exists" }));
          }

          if (!(await spaceIn(tx, workspaceId, input.spaceId))) {
            return fail(new Invalid({ message: "That space doesn't exist" }));
          }

          await tx.insertChat({
            id: input.id,
            workspaceId,
            spaceId: input.spaceId,
            createdById: actor.id,
            title: title.value,
            sessionId,
          });

          return ok(undefined);
        });

        return { txid, sessionId };
      }),

    update: (actor, id, input) => {
      const title = input.title === undefined ? undefined : normalizeChatTitle(input.title);

      if (title && !title.ok) return Effect.fail(new Invalid({ message: title.message }));

      return write(actor, "update", async (workspaceId, _, tx) => {
        const chat = isChatId(id) ? await tx.chat(id) : null;

        if (!chat || chat.workspaceId !== workspaceId || !canSee(chat, actor.id)) {
          return fail(notFound());
        }

        const spaceId = input.spaceId;

        if (spaceId === null && chat.spaceId !== null && chat.createdById !== actor.id) {
          return fail(
            new Forbidden({ message: "Only the person who started a chat can make it private" }),
          );
        }

        if (spaceId !== undefined && !(await spaceIn(tx, workspaceId, spaceId))) {
          return fail(new Invalid({ message: "That space doesn't exist" }));
        }

        const patch: ChatPatch = {};

        if (title?.ok) patch.title = title.value;

        if (spaceId !== undefined) patch.spaceId = spaceId;

        await tx.updateChat(id, patch);

        return ok(undefined);
      });
    },

    remove: (actor, id) => {
      let sessionId: string | undefined;

      return write(actor, "remove", async (workspaceId, _, tx) => {
        const chat = isChatId(id) ? await tx.chat(id) : null;

        if (!chat || chat.workspaceId !== workspaceId || !canSee(chat, actor.id)) {
          return fail(notFound());
        }

        if (chat.createdById !== actor.id) {
          return fail(
            new Forbidden({ message: "Only the person who started a chat can delete it" }),
          );
        }

        sessionId = chat.sessionId;
        await tx.deleteChat(id);

        return ok(undefined);
      }).pipe(
        Effect.tap(() =>
          Effect.promise(async () => {
            await kv.delete(historyKey(id));

            if (sessionId) await agent?.endSession(sessionId).catch(() => undefined);
          }),
        ),
      );
    },

    history: (actor, id) =>
      run("history", async () => {
        const chat = await visibleChat(actor, id);

        if (!chat.ok) return chat;

        const cached = Option.getOrNull(decodeCached(await kv.get(historyKey(id))));
        const from = cached?.streamIndex ?? 0;
        const saved = cached?.events ?? [];

        if (!agent) {
          return ok({
            session: { sessionId: chat.value.sessionId, streamIndex: from },
            events: [...saved],
          });
        }

        const fresh = await agent
          .readEvents(callerIn(actor, chat.value.workspaceId), chat.value.sessionId, from)
          .catch(() => null);

        // The agent is down: show what we have; the page follows the stream once it's back.
        if (fresh === null) {
          return ok({
            session: { sessionId: chat.value.sessionId, streamIndex: from },
            events: [...saved],
          });
        }

        const events = [...saved, ...fresh.events];
        const value = JSON.stringify({ streamIndex: fresh.streamIndex, events });

        if (value.length <= HISTORY_CACHE_MAX_BYTES) {
          await kv.set(historyKey(id), value, HISTORY_TTL_SECONDS);
        }

        return ok({
          session: { sessionId: chat.value.sessionId, streamIndex: fresh.streamIndex },
          events,
        });
      }),

    createSpace: (actor, input) => {
      const name = normalizeSpaceName(input.name);

      if (!isSpaceId(input.id))
        return Effect.fail(new Invalid({ message: "That space id is not valid" }));

      if (!name.ok) return Effect.fail(new Invalid({ message: name.message }));

      if (!isSpaceColor(input.color))
        return Effect.fail(new Invalid({ message: "Choose a colour" }));

      return write(actor, "createSpace", async (workspaceId, _, tx) => {
        if (await tx.space(input.id)) {
          return fail(new Invalid({ message: "A space with this id already exists" }));
        }

        await tx.insertSpace({
          id: input.id,
          workspaceId,
          name: name.value,
          color: input.color,
          createdById: actor.id,
        });

        return ok(undefined);
      });
    },

    updateSpace: (actor, id, input) => {
      const name = input.name === undefined ? undefined : normalizeSpaceName(input.name);

      if (name && !name.ok) return Effect.fail(new Invalid({ message: name.message }));

      if (input.color !== undefined && !isSpaceColor(input.color)) {
        return Effect.fail(new Invalid({ message: "Choose a colour" }));
      }

      return write(actor, "updateSpace", async (workspaceId, role, tx) => {
        const space = isSpaceId(id) ? await tx.space(id) : null;

        if (space?.workspaceId !== workspaceId) {
          return fail(new NotFound({ message: "Space not found" }));
        }

        if (space.createdById !== actor.id && !isManager(role)) {
          return fail(
            new Forbidden({
              message: "Only the person who made a space, or an admin, can change it",
            }),
          );
        }

        const patch: SpacePatch = {};

        if (name?.ok) patch.name = name.value;

        if (input.color !== undefined) patch.color = input.color;

        await tx.updateSpace(id, patch);

        return ok(undefined);
      });
    },

    removeSpace: (actor, id) =>
      write(actor, "removeSpace", async (workspaceId, role, tx) => {
        const space = isSpaceId(id) ? await tx.space(id) : null;

        if (space?.workspaceId !== workspaceId) {
          return fail(new NotFound({ message: "Space not found" }));
        }

        if (space.createdById !== actor.id && !isManager(role)) {
          return fail(
            new Forbidden({
              message: "Only the person who made a space, or an admin, can delete it",
            }),
          );
        }

        // Its chats become private to the people who started them (ON DELETE SET NULL).
        await tx.deleteSpace(id);

        return ok(undefined);
      }),

    saveSidebar: (actor, input) => {
      const layout = parseSidebarLayout(input.pinned, input.folders);

      return write(actor, "saveSidebar", async (workspaceId, _, tx) => {
        // The first save names the row; later saves keep the stored id whatever the client sends.
        const id = (await tx.sidebarId(workspaceId, actor.id)) ?? input.id;

        if (!isSidebarId(id)) return fail(new Invalid({ message: "That sidebar id is not valid" }));

        await tx.saveSidebar({
          id,
          workspaceId,
          userId: actor.id,
          layout,
        });

        return ok(undefined);
      });
    },

    forward: (actor, chatId, path, request) =>
      run("forward", async () => {
        const chat = await visibleChat(actor, chatId);

        if (!chat.ok) return chat;

        // Only the chat's own session, and never `POST /eve/v1/session` (creation).
        if (proxiedSession(path) !== chat.value.sessionId) return fail(notFound());

        if (!agent) return fail(agentDown());

        const isMessage = request.method === "POST" && path.endsWith(chat.value.sessionId);

        const response = await agent
          .forward(callerIn(actor, chat.value.workspaceId), path, request)
          .catch(() => null);

        if (response === null) return fail(agentDown());

        if (isMessage && response.ok) await store.touch(chatId);

        return ok(response);
      }),
  };
}

function chatTx(tx: DbTx): ChatTx {
  const chats = tx.orm.public.Chat;
  const spaces = tx.orm.public.ChatSpace;
  const sidebars = tx.orm.public.Sidebar;

  return {
    role: async (workspaceId, userId) =>
      (await tx.orm.public.Member.where({ organizationId: workspaceId, userId }).first())?.role ??
      null,
    chat: async (id) => chats.where({ id }).first(),
    insertChat: async (row) => {
      const now = new Date();

      await chats.create({ ...row, createdAt: now, updatedAt: now, lastMessageAt: now });
    },
    // `updatedAt` is always written, so the client's txid shows up in the shape stream.
    updateChat: async (id, patch) => {
      await chats.where({ id }).update({ ...patch, updatedAt: new Date() });
    },
    deleteChat: async (id) => {
      await chats.where({ id }).delete();
    },
    space: async (id) => spaces.where({ id }).first(),
    insertSpace: async (row) => {
      await spaces.create({ ...row, createdAt: new Date() });
    },
    updateSpace: async (id, patch) => {
      await spaces.where({ id }).update(patch);
    },
    deleteSpace: async (id) => {
      await spaces.where({ id }).delete();
    },
    sidebarId: async (workspaceId, userId) =>
      (await sidebars.where({ workspaceId, userId }).first())?.id ?? null,
    saveSidebar: async (row) => {
      const values = {
        pinned: [...row.layout.pinned],
        folders: row.layout.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          chatIds: [...folder.chatIds],
        })),
        updatedAt: new Date(),
      };

      const updated = await sidebars.where({ id: row.id }).update(values);

      if (updated === null) {
        await sidebars.create({
          id: row.id,
          workspaceId: row.workspaceId,
          userId: row.userId,
          ...values,
        });
      }
    },
  };
}

/** The Prisma 8 store: ORM writes plus `pg_current_xact_id()` in the same transaction. */
export function prismaChatStore(db: Db): ChatStore {
  return {
    transact: (fn) => transactWithTxid(db, (tx) => fn(chatTx(tx))),
    role: async (workspaceId, userId) =>
      (await db.orm.public.Member.where({ organizationId: workspaceId, userId }).first())?.role ??
      null,
    chat: async (id) => db.orm.public.Chat.where({ id }).first(),
    touch: async (id) => {
      const now = new Date();

      await db.orm.public.Chat.where({ id }).update({ lastMessageAt: now, updatedAt: now });
    },
  };
}

export class Chats extends Context.Service<Chats, ChatsService>()("@crm/api/services/Chats") {
  static readonly layer = Layer.effect(
    Chats,
    Effect.gen(function* () {
      const config = yield* AppConfig;

      // Without the shared secret the agent would refuse every call: chats are off.
      const agent = Option.match(config.agentProxySecret, {
        onNone: () => null,
        onSome: (secret) => eveChatAgent(config.agentUrl, Redacted.value(secret)),
      });

      return makeChats(prismaChatStore(yield* Database), agent, yield* Kv);
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer]));
}
