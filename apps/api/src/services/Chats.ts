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
  DEFAULT_PERMISSION_MODE,
  isPermissionMode,
  isSpaceId,
  normalizeChatTitle,
  type PermissionMode,
  normalizeSpaceDescription,
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
import { gatewayJev } from "@crm/memory/jev-gateway";
import {
  FOLLOW_UP_WAIT_MS,
  type FollowUpJudge,
  type FollowUpMode,
  jevFollowUpJudge,
} from "./follow-up.ts";

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
  /** `manual`, `auto` or `bypass` (ADR 0019). */
  readonly permissionMode: string;
  /** The CRM made the title; a person's rename turns it off. Absent means on. */
  readonly autoTitle?: boolean;
}

export interface SpaceRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly createdById: string | null;
}

/** The chat columns a member may change. */
export interface ChatPatch {
  title?: string;
  spaceId?: string | null;
  permissionMode?: PermissionMode;
  autoTitle?: boolean;
}

/** The space columns its maker (or an admin) may change. */
export interface SpacePatch {
  name?: string;
  description?: string;
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
  isSpaceMember(spaceId: string, userId: string): Promise<boolean>;
  /** Joins a space; joining twice changes nothing. */
  joinSpace(row: { spaceId: string; userId: string; workspaceId: string }): Promise<void>;
  /** `false` when the user hadn't joined. */
  leaveSpace(spaceId: string, userId: string): Promise<boolean>;
  /** The id of the user's sidebar row in the workspace, if there is one. */
  sidebarId(workspaceId: string, userId: string): Promise<string | null>;
  saveSidebar(row: {
    id: string;
    workspaceId: string;
    userId: string;
    layout: SidebarLayout;
    /** False when the client sent no Recents order: the stored one stays. */
    saveRecent: boolean;
  }): Promise<void>;
}

export interface ChatStore {
  transact<A>(fn: (tx: ChatTx) => Promise<A>): Promise<{ result: A; txid: number }>;
  role(workspaceId: string, userId: string): Promise<string | null>;
  chat(id: string): Promise<ChatRow | null>;
  isSpaceMember(spaceId: string, userId: string): Promise<boolean>;
  chatBySession(sessionId: string): Promise<ChatRow | null>;
  /** Sets a title the agent made, only while the chat's title is still the CRM's own. */
  setAutoTitle(id: string, title: string): Promise<boolean>;
  /** Marks a message sent now (Recents order). */
  touch(id: string): Promise<void>;
}

export class ChatStoreError extends Schema.TaggedError<ChatStoreError>()("ChatStoreError", {
  cause: Schema.Defect(),
}) {}

type TxId = { readonly txid: number };

type Failure = NotFound | NoActiveWorkspace | Invalid | Forbidden | AgentUnavailable;

type Outcome<A> = { ok: true; value: A } | { ok: false; error: Failure };

/** How long creating a chat waits to confirm its prewarmed session still exists. */
export const PREWARM_CHECK_MS = 1000;

/** How long a prewarmed session waits for its chat. */
export const PREWARM_TTL_SECONDS = 10 * 60;

/** How long a chat's events stay in Redis after the last read. */
export const HISTORY_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * How long a history read waits for eve. A busy or restarting agent can hold the read for tens
 * of seconds; the page shows the cached events and follows the stream for the rest.
 */
export const HISTORY_READ_WAIT_MS = 1500;

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

/**
 * Who sees a chat (ADR 0020): the person who started it, and the members of its space. The chat
 * shape uses the same rule (`chatsSync`).
 */
export async function canSee(
  chat: ChatRow,
  userId: string,
  isSpaceMember: (spaceId: string, userId: string) => Promise<boolean>,
) {
  if (chat.createdById === userId) return true;

  return chat.spaceId !== null && isSpaceMember(chat.spaceId, userId);
}

const isManager = (role: string | null) => role === "owner" || role === "admin";

const CachedHistory = Schema.fromJsonString(
  Schema.Struct({ streamIndex: Schema.Number, events: Schema.Array(Schema.Unknown) }),
);

const decodeCached = Schema.decodeUnknownOption(CachedHistory);

export interface ChatsService {
  readonly prewarm: (actor: ChatActor) => Effect.Effect<void, Failure>;
  readonly create: (
    actor: ChatActor,
    input: {
      id: string;
      title: string;
      spaceId: string | null;
      permissionMode?: string | undefined;
    },
  ) => Effect.Effect<{ txid: number; sessionId: string }, Failure>;
  readonly update: (
    actor: ChatActor,
    id: string,
    input: {
      title?: string | undefined;
      spaceId?: string | null | undefined;
      permissionMode?: string | undefined;
    },
  ) => Effect.Effect<TxId, Failure>;
  readonly remove: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  readonly history: (actor: ChatActor, id: string) => Effect.Effect<ChatHistory, Failure>;
  /** Succeeds when the actor may see the chat; Not found otherwise. */
  readonly visible: (actor: ChatActor, id: string) => Effect.Effect<void, Failure>;
  /** Whether a message sent mid-turn redirects the turn or waits for it. */
  readonly followUp: (
    actor: ChatActor,
    id: string,
    input: { message: string; task: string },
  ) => Effect.Effect<{ mode: FollowUpMode }, Failure>;
  readonly createSpace: (
    actor: ChatActor,
    input: { id: string; name: string; color: string; description?: string | undefined },
  ) => Effect.Effect<TxId, Failure>;
  readonly updateSpace: (
    actor: ChatActor,
    id: string,
    input: {
      name?: string | undefined;
      color?: string | undefined;
      description?: string | undefined;
    },
  ) => Effect.Effect<TxId, Failure>;
  readonly removeSpace: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  /** Join and leave a space (ADR 0020). Any member of the workspace may join any space. */
  readonly joinSpace: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  readonly leaveSpace: (actor: ChatActor, id: string) => Effect.Effect<TxId, Failure>;
  /**
   * The agent names a chat after its first turn (a small model, in the agent). Kept only while
   * the title is still the CRM's own; the caller must see the chat.
   */
  readonly titleFromAgent: (
    caller: { userId: string; workspaceId: string },
    sessionId: string,
    title: string,
  ) => Effect.Effect<void, Failure>;
  readonly saveSidebar: (
    actor: ChatActor,
    input: {
      id: string;
      pinned: readonly string[];
      folders: readonly FolderInput[];
      recentOrder?: readonly string[] | undefined;
    },
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

/**
 * The path a proxied request may take: one session's messages, stream, Stop, compact and clear.
 * Never session creation, and never end or reset, which would retire the chat's session.
 */
export function proxiedSession(path: string): string | undefined {
  const match = /^\/eve\/v1\/session\/([^/]+)(?:\/(?:stream|cancel|compact|clear))?$/.exec(path);

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
const callerIn = (
  actor: ChatActor,
  workspaceId: string | null,
  permissionMode?: string,
): AgentCaller => ({
  id: actor.id,
  name: actor.name,
  email: actor.email,
  workspaceId,
  permissionMode: permissionMode ?? DEFAULT_PERMISSION_MODE,
});

const notMember = () => new Forbidden({ message: "Join the space first" });

const badMode = () => new Invalid({ message: "Choose Plan, Manual, Auto or Bypass permissions" });

/** The chats use cases over an injected store, agent and KV (Redis in production). */
export function makeChats(
  store: ChatStore,
  agent: ChatAgent | null,
  kv: KvStore,
  historyReadWaitMs = HISTORY_READ_WAIT_MS,
  /** Judges messages sent mid-turn; without one (no AI Gateway key), they steer. */
  judge: FollowUpJudge | null = null,
): ChatsService {
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

    return chat &&
      chat.workspaceId === workspaceId &&
      (await canSee(chat, actor.id, store.isSpaceMember))
      ? ok(chat)
      : fail(notFound());
  };

  const createSession = async (actor: ChatActor, workspaceId: string) => {
    if (!agent) return null;

    const caller = callerIn(actor, actor.activeWorkspaceId);
    const prewarmed = await kv.take(prewarmKey(workspaceId, actor.id));

    // A session made before the agent restarted (a deploy, a dev reload) is gone, and the first
    // message would fail with "The session is no longer active". A quick read proves it lives.
    const alive =
      prewarmed !== null &&
      (await Promise.race([
        agent.readEvents(caller, prewarmed, 0).then(
          () => true,
          () => false,
        ),
        Bun.sleep(PREWARM_CHECK_MS).then(() => false),
      ]));

    return alive ? prewarmed : agent.createSession(caller).catch(() => null);
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

        if (input.permissionMode !== undefined && !isPermissionMode(input.permissionMode)) {
          return yield* badMode();
        }

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

          if (input.spaceId !== null && !(await tx.isSpaceMember(input.spaceId, actor.id))) {
            return fail(notMember());
          }

          await tx.insertChat({
            id: input.id,
            workspaceId,
            spaceId: input.spaceId,
            createdById: actor.id,
            title: title.value,
            sessionId,
            permissionMode: input.permissionMode ?? DEFAULT_PERMISSION_MODE,
          });

          return ok(undefined);
        });

        return { txid, sessionId };
      }),

    update: (actor, id, input) => {
      const title = input.title === undefined ? undefined : normalizeChatTitle(input.title);

      if (title && !title.ok) return Effect.fail(new Invalid({ message: title.message }));

      const mode = input.permissionMode;

      if (mode !== undefined && !isPermissionMode(mode)) return Effect.fail(badMode());

      return write(actor, "update", async (workspaceId, _, tx) => {
        const chat = isChatId(id) ? await tx.chat(id) : null;

        if (
          !chat ||
          chat.workspaceId !== workspaceId ||
          !(await canSee(chat, actor.id, tx.isSpaceMember))
        ) {
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

        // Moving a chat into a space you haven't joined would hide it from you.
        if (spaceId && !(await tx.isSpaceMember(spaceId, actor.id))) return fail(notMember());

        const patch: ChatPatch = {};

        // A person's title is theirs: the agent stops naming the chat.
        if (title?.ok) {
          patch.title = title.value;
          patch.autoTitle = false;
        }

        if (spaceId !== undefined) patch.spaceId = spaceId;

        if (mode !== undefined) patch.permissionMode = mode;

        await tx.updateChat(id, patch);

        return ok(undefined);
      });
    },

    remove: (actor, id) => {
      let sessionId: string | undefined;

      return write(actor, "remove", async (workspaceId, _, tx) => {
        const chat = isChatId(id) ? await tx.chat(id) : null;

        if (
          !chat ||
          chat.workspaceId !== workspaceId ||
          !(await canSee(chat, actor.id, tx.isSpaceMember))
        ) {
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

    visible: (actor, id) =>
      run("visible", async () => {
        const chat = await visibleChat(actor, id);

        return chat.ok ? ok(undefined) : chat;
      }),

    followUp: (actor, id, input) =>
      run("followUp", async () => {
        const chat = await visibleChat(actor, id);

        if (!chat.ok) return chat;

        if (!judge) return ok({ mode: "steer" as const });

        // A slow answer would hold the message back: past the wait, it steers.
        const signal = AbortSignal.timeout(FOLLOW_UP_WAIT_MS);

        const mode = await Promise.race([
          judge({ task: input.task.slice(0, 4000), message: input.message.slice(0, 4000) }, signal),
          Bun.sleep(FOLLOW_UP_WAIT_MS).then(() => "steer" as const),
        ]);

        return ok({ mode });
      }),

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

        const fresh = await Promise.race([
          agent
            .readEvents(callerIn(actor, chat.value.workspaceId), chat.value.sessionId, from)
            .catch(() => null),
          Bun.sleep(historyReadWaitMs).then(() => null),
        ]);

        // The agent is down or slow: show what we have; the page follows the stream from there.
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

      const description = normalizeSpaceDescription(input.description ?? "");

      if (!description.ok) return Effect.fail(new Invalid({ message: description.message }));

      return write(actor, "createSpace", async (workspaceId, _, tx) => {
        if (await tx.space(input.id)) {
          return fail(new Invalid({ message: "A space with this id already exists" }));
        }

        await tx.insertSpace({
          id: input.id,
          workspaceId,
          name: name.value,
          description: description.value,
          color: input.color,
          createdById: actor.id,
        });

        // The person who makes a space joins it.
        await tx.joinSpace({ spaceId: input.id, userId: actor.id, workspaceId });

        return ok(undefined);
      });
    },

    updateSpace: (actor, id, input) => {
      const name = input.name === undefined ? undefined : normalizeSpaceName(input.name);

      if (name && !name.ok) return Effect.fail(new Invalid({ message: name.message }));

      if (input.color !== undefined && !isSpaceColor(input.color)) {
        return Effect.fail(new Invalid({ message: "Choose a colour" }));
      }

      const description =
        input.description === undefined ? undefined : normalizeSpaceDescription(input.description);

      if (description && !description.ok) {
        return Effect.fail(new Invalid({ message: description.message }));
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

        if (description?.ok) patch.description = description.value;

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

    joinSpace: (actor, id) =>
      write(actor, "joinSpace", async (workspaceId, _, tx) => {
        const space = isSpaceId(id) ? await tx.space(id) : null;

        if (space?.workspaceId !== workspaceId) {
          return fail(new NotFound({ message: "Space not found" }));
        }

        await tx.joinSpace({ spaceId: id, userId: actor.id, workspaceId });

        return ok(undefined);
      }),

    leaveSpace: (actor, id) =>
      write(actor, "leaveSpace", async (workspaceId, _, tx) => {
        const space = isSpaceId(id) ? await tx.space(id) : null;

        if (space?.workspaceId !== workspaceId || !(await tx.leaveSpace(id, actor.id))) {
          return fail(new NotFound({ message: "You haven't joined this space" }));
        }

        return ok(undefined);
      }),

    titleFromAgent: (caller, sessionId, title) =>
      run("titleFromAgent", async () => {
        const name = normalizeChatTitle(title);

        if (!name.ok) return fail(new Invalid({ message: name.message }));

        const chat = await store.chatBySession(sessionId);

        if (
          !chat ||
          chat.workspaceId !== caller.workspaceId ||
          !(await canSee(chat, caller.userId, store.isSpaceMember))
        ) {
          return fail(notFound());
        }

        await store.setAutoTitle(chat.id, name.value);

        return ok(undefined);
      }),

    saveSidebar: (actor, input) => {
      const layout = parseSidebarLayout(input.pinned, input.folders, input.recentOrder);

      return write(actor, "saveSidebar", async (workspaceId, _, tx) => {
        // The first save names the row; later saves keep the stored id whatever the client sends.
        const id = (await tx.sidebarId(workspaceId, actor.id)) ?? input.id;

        if (!isSidebarId(id)) return fail(new Invalid({ message: "That sidebar id is not valid" }));

        await tx.saveSidebar({
          id,
          workspaceId,
          userId: actor.id,
          layout,
          saveRecent: input.recentOrder !== undefined,
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
          .forward(
            callerIn(actor, chat.value.workspaceId, chat.value.permissionMode),
            path,
            request,
          )
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
    isSpaceMember: async (spaceId, userId) =>
      (await tx.orm.public.ChatSpaceMember.where({ spaceId, userId }).first()) !== null,
    joinSpace: async (row) => {
      const members = tx.orm.public.ChatSpaceMember;

      if (await members.where({ spaceId: row.spaceId, userId: row.userId }).first()) return;

      await members.create({ ...row, joinedAt: new Date() });
    },
    leaveSpace: async (spaceId, userId) =>
      (await tx.orm.public.ChatSpaceMember.where({ spaceId, userId }).delete()) !== null,
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

      // A client that sent no Recents order leaves the stored one as it was.
      const updated = await sidebars
        .where({ id: row.id })
        .update(row.saveRecent ? { ...values, recentOrder: [...row.layout.recent] } : values);

      if (updated === null) {
        await sidebars.create({
          id: row.id,
          workspaceId: row.workspaceId,
          userId: row.userId,
          ...values,
          recentOrder: [...row.layout.recent],
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
    chatBySession: async (sessionId) => db.orm.public.Chat.where({ sessionId }).first(),
    setAutoTitle: async (id, title) =>
      (await db.orm.public.Chat.where({ id, autoTitle: true }).update({
        title,
        // Named once: later turns don't rename it.
        autoTitle: false,
        updatedAt: new Date(),
      })) !== null,
    isSpaceMember: async (spaceId, userId) =>
      (await db.orm.public.ChatSpaceMember.where({ spaceId, userId }).first()) !== null,
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

      // Jev judges messages sent mid-turn when the API can reach the AI Gateway.
      const judge = Option.isSome(config.aiGatewayApiKey) ? jevFollowUpJudge(gatewayJev()) : null;

      return makeChats(
        prismaChatStore(yield* Database),
        agent,
        yield* Kv,
        HISTORY_READ_WAIT_MS,
        judge,
      );
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer]));
}
