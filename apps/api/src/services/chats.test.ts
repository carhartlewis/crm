import { describe, expect, test } from "bun:test";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { createMemoryKv } from "@crm/core/kv";
import { Cause, Effect, Exit, Option, References } from "effect";
import type { AgentCaller, ChatAgent } from "./chat-agent.ts";
import { createMemoryChatStore } from "./chat-store-memory.ts";
import { type ChatActor, makeChats, proxiedSession } from "./Chats.ts";

const person = (id: string, workspace = "ws_a"): ChatActor => ({
  id,
  name: id,
  email: `${id}@example.com`,
  activeWorkspaceId: workspace,
});

const alice = person("alice");
const bob = person("bob");
const dana = person("dana");
const mallory = person("mallory", "ws_b");

/** Stand-ins for eve stream events. */
interface FakeEvent {
  readonly type: string;
}

/** A fake eve: numbered sessions, a growing event log per session, and recorded calls. */
function fakeAgent() {
  let next = 0;
  const logs = new Map<string, FakeEvent[]>();
  const calls: string[] = [];
  const modes: string[] = [];

  const agent: ChatAgent = {
    createSession: async (caller: AgentCaller) => {
      next += 1;
      calls.push(`create ${caller.id}`);
      logs.set(`ses_${next}`, []);

      return `ses_${next}`;
    },
    readEvents: async (_caller, sessionId, startIndex) => {
      calls.push(`read ${sessionId} from ${startIndex}`);
      const log = logs.get(sessionId) ?? [];

      return { events: log.slice(startIndex), streamIndex: log.length };
    },
    endSession: async (sessionId) => {
      calls.push(`end ${sessionId}`);
    },
    forward: async (caller, path, request) => {
      calls.push(`${request.method} ${path} as ${caller.id} in ${caller.workspaceId}`);
      modes.push(caller.permissionMode ?? "none");

      return new Response("{}", { status: 202 });
    },
  };

  return {
    agent,
    calls,
    modes,
    append: (sessionId: string, event: FakeEvent) => logs.get(sessionId)?.push(event),
  };
}

function setup() {
  const memory = createMemoryChatStore([
    "ws_a:alice:owner",
    "ws_a:bob",
    "ws_a:dana",
    "ws_b:mallory",
  ]);

  const eve = fakeAgent();
  const kv = createMemoryKv();

  return { ...memory, ...eve, kv, chats: makeChats(memory.store, eve.agent, kv) };
}

/** The failure's tag, "Die" for a defect, or "Success". */
async function outcome<A, E extends object>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(
    Effect.provideService(effect, References.MinimumLogLevel, "None"),
  );

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    onSome: (error) => error.constructor.name,
  });
}

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const chatId = () => createId(ID_PREFIXES.chat);

const get = () => new Request("http://api.test/x");
const spaceId = () => createId(ID_PREFIXES.chat_space);

describe("starting a chat", () => {
  test("takes the prewarmed session, so the first message skips session start", async () => {
    const { chats, calls } = setup();

    await run(chats.prewarm(alice));
    // A second prewarm keeps the session it has.
    await run(chats.prewarm(alice));

    const created = await run(chats.create(alice, { id: chatId(), title: "Hi", spaceId: null }));

    expect(created.sessionId).toBe("ses_1");
    expect(calls).toEqual(["create alice"]);
  });

  test("creates a session when none is prewarmed, and a prewarmed one is used once", async () => {
    const { chats } = setup();

    await run(chats.prewarm(alice));
    await run(chats.create(alice, { id: chatId(), title: "One", spaceId: null }));
    const second = await run(chats.create(alice, { id: chatId(), title: "Two", spaceId: null }));

    expect(second.sessionId).toBe("ses_2");
  });

  test("a prewarmed session is per person", async () => {
    const { chats } = setup();

    await run(chats.prewarm(alice));
    const bobs = await run(chats.create(bob, { id: chatId(), title: "Mine", spaceId: null }));

    expect(bobs.sessionId).toBe("ses_2");
  });

  test("refuses bad ids, empty titles, unknown spaces and non-members", async () => {
    const { chats } = setup();

    expect(await outcome(chats.create(alice, { id: "x", title: "Hi", spaceId: null }))).toBe(
      "Invalid",
    );
    expect(await outcome(chats.create(alice, { id: chatId(), title: " ", spaceId: null }))).toBe(
      "Invalid",
    );
    expect(
      await outcome(chats.create(alice, { id: chatId(), title: "Hi", spaceId: spaceId() })),
    ).toBe("Invalid");
    expect(
      await outcome(chats.create(person("eve"), { id: chatId(), title: "Hi", spaceId: null })),
    ).toBe("NoActiveWorkspace");
  });

  test("without an agent, chats can't start", async () => {
    const memory = createMemoryChatStore(["ws_a:alice"]);
    const chats = makeChats(memory.store, null, createMemoryKv());

    expect(await outcome(chats.create(alice, { id: chatId(), title: "Hi", spaceId: null }))).toBe(
      "AgentUnavailable",
    );
  });
});

async function sharedAndPrivate() {
  const context = setup();
  const space = spaceId();

  await run(context.chats.createSpace(alice, { id: space, name: "Sales", color: "blue" }));

  const shared = chatId();
  const secret = chatId();

  await run(context.chats.create(alice, { id: shared, title: "Pipeline", spaceId: space }));
  await run(context.chats.create(alice, { id: secret, title: "Mine", spaceId: null }));
  // Bob joined the space; Dana didn't.
  await run(context.chats.joinSpace(bob, space));

  return { ...context, space, shared, secret };
}

describe("who sees and changes a chat", () => {
  test("a private chat is only its starter's; a space chat is its members'", async () => {
    const { chats, shared, secret, space } = await sharedAndPrivate();

    expect(await outcome(chats.history(bob, secret))).toBe("NotFound");
    expect(await outcome(chats.history(bob, shared))).toBe("Success");
    expect(await outcome(chats.history(dana, shared))).toBe("NotFound");

    // Joining gives access; leaving takes it away.
    await run(chats.joinSpace(dana, space));
    expect(await outcome(chats.history(dana, shared))).toBe("Success");
    await run(chats.leaveSpace(dana, space));
    expect(await outcome(chats.history(dana, shared))).toBe("NotFound");
    // Another workspace's chat is not found: ids reveal nothing.
    expect(await outcome(chats.history(mallory, shared))).toBe("NotFound");
  });

  test("a chat moves only into a space the mover joined", async () => {
    const { chats, shared } = await sharedAndPrivate();
    const elsewhere = spaceId();

    await run(chats.createSpace(dana, { id: elsewhere, name: "Dana's", color: "green" }));

    expect(await outcome(chats.update(bob, shared, { spaceId: elsewhere }))).toBe("Forbidden");
  });

  test("anyone who sees a chat may rename it and move it between spaces", async () => {
    const { chats, rows, shared } = await sharedAndPrivate();
    const other = spaceId();

    await run(chats.createSpace(bob, { id: other, name: "Ops", color: "green" }));
    await run(chats.update(bob, shared, { title: "Q4 pipeline", spaceId: other }));

    expect(rows().chats.get(shared)).toMatchObject({ title: "Q4 pipeline", spaceId: other });
  });

  test("only the starter makes a chat private or deletes it", async () => {
    const { chats, calls, shared } = await sharedAndPrivate();

    expect(await outcome(chats.update(bob, shared, { spaceId: null }))).toBe("Forbidden");
    expect(await outcome(chats.remove(bob, shared))).toBe("Forbidden");
    expect(await outcome(chats.update(alice, shared, { spaceId: null }))).toBe("Success");
    expect(await outcome(chats.remove(alice, shared))).toBe("Success");
    expect(calls).toContain("end ses_1");
  });

  test("deleting a space makes its chats private; only its maker or an admin may", async () => {
    const { chats, rows, space, shared } = await sharedAndPrivate();
    const bobs = spaceId();

    await run(chats.createSpace(bob, { id: bobs, name: "Bob's", color: "pink" }));

    expect(await outcome(chats.removeSpace(dana, space))).toBe("Forbidden");
    // Alice is the workspace owner: she may delete Bob's space too.
    expect(await outcome(chats.removeSpace(alice, bobs))).toBe("Success");
    expect(await outcome(chats.removeSpace(alice, space))).toBe("Success");
    expect(rows().chats.get(shared)?.spaceId).toBeNull();
    expect(await outcome(chats.history(bob, shared))).toBe("NotFound");
  });

  test("space names and colours follow the shared rules", async () => {
    const { chats } = setup();

    expect(
      await outcome(chats.createSpace(alice, { id: spaceId(), name: "", color: "blue" })),
    ).toBe("Invalid");
    expect(
      await outcome(chats.createSpace(alice, { id: spaceId(), name: "Sales", color: "neon" })),
    ).toBe("Invalid");
  });
});

describe("history", () => {
  test("serves saved events from the cache and reads only the new lines from eve", async () => {
    const { chats, calls, append } = setup();
    const id = chatId();

    await run(chats.create(alice, { id, title: "Hi", spaceId: null }));
    append("ses_1", { type: "turn.started" });

    const first = await run(chats.history(alice, id));

    append("ses_1", { type: "turn.settled" });

    const second = await run(chats.history(alice, id));

    expect(first).toEqual({
      session: { sessionId: "ses_1", streamIndex: 1 },
      events: [{ type: "turn.started" }],
    });
    expect(second.events).toEqual([{ type: "turn.started" }, { type: "turn.settled" }]);
    expect(calls.filter((call) => call.startsWith("read"))).toEqual([
      "read ses_1 from 0",
      "read ses_1 from 1",
    ]);
  });

  test("when eve is down, the cached events still load", async () => {
    const memory = createMemoryChatStore(["ws_a:alice"]);
    const eve = fakeAgent();
    const kv = createMemoryKv();
    const chats = makeChats(memory.store, eve.agent, kv);
    const id = chatId();

    await run(chats.create(alice, { id, title: "Hi", spaceId: null }));
    eve.append("ses_1", { type: "turn.started" });
    await run(chats.history(alice, id));

    const down = makeChats(
      memory.store,
      { ...eve.agent, readEvents: () => Promise.reject(new Error("down")) },
      kv,
    );

    expect((await run(down.history(alice, id))).events).toEqual([{ type: "turn.started" }]);
  });
});

describe("the agent proxy", () => {
  test("forwards only the chat's own session, as the caller", async () => {
    const { chats, calls, rows } = setup();
    const space = spaceId();
    const id = chatId();

    await run(chats.createSpace(alice, { id: space, name: "Sales", color: "blue" }));
    await run(chats.create(alice, { id, title: "Hi", spaceId: space }));
    await run(chats.joinSpace(bob, space));

    const before = rows().chats.get(id)?.lastMessageAt ?? 0;
    const message = new Request("http://api.test/x", { method: "POST", body: "{}" });

    expect(await outcome(chats.forward(bob, id, "/eve/v1/session/ses_1", message))).toBe("Success");
    expect(
      await outcome(
        chats.forward(bob, id, "/eve/v1/session/ses_1/stream", new Request("http://api.test/x")),
      ),
    ).toBe("Success");
    expect(calls.slice(-2)).toEqual([
      "POST /eve/v1/session/ses_1 as bob in ws_a",
      "GET /eve/v1/session/ses_1/stream as bob in ws_a",
    ]);
    expect(rows().chats.get(id)?.lastMessageAt).toBeGreaterThanOrEqual(before);
  });

  test("refuses another session, session creation, and chats the caller can't see", async () => {
    const { chats } = setup();
    const id = chatId();

    await run(chats.create(alice, { id, title: "Hi", spaceId: null }));

    expect(await outcome(chats.forward(alice, id, "/eve/v1/session/ses_9/stream", get()))).toBe(
      "NotFound",
    );
    expect(await outcome(chats.forward(alice, id, "/eve/v1/session", get()))).toBe("NotFound");
    expect(await outcome(chats.forward(bob, id, "/eve/v1/session/ses_1/stream", get()))).toBe(
      "NotFound",
    );
  });

  test("session paths: the session itself and its stream, nothing else", () => {
    expect(proxiedSession("/eve/v1/session/ses_1")).toBe("ses_1");
    expect(proxiedSession("/eve/v1/session/ses_1/stream")).toBe("ses_1");
    expect(proxiedSession("/eve/v1/session")).toBeUndefined();
    expect(proxiedSession("/eve/v1/info")).toBeUndefined();
    expect(proxiedSession("/eve/v1/session/ses_1/../other")).toBeUndefined();
  });
});

describe("the sidebar row", () => {
  test("is one row per person; later saves keep its id and drop bad entries", async () => {
    const { chats, rows } = setup();
    const first = createId(ID_PREFIXES.sidebar);
    const chat = chatId();

    await run(chats.saveSidebar(alice, { id: first, pinned: ["page:companies"], folders: [] }));
    await run(
      chats.saveSidebar(alice, {
        id: createId(ID_PREFIXES.sidebar),
        pinned: [`chat:${chat}`, "bogus"],
        folders: [{ id: createId(ID_PREFIXES.folder), name: "Renewals", chatIds: [chat] }],
      }),
    );

    const saved = [...rows().sidebars.values()];

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: first, userId: "alice", pinned: [`chat:${chat}`] });
  });
});

describe("permission modes", () => {
  test("a chat starts in Manual, changes mode, and the agent hears the chat's mode", async () => {
    const { chats, rows, modes } = setup();
    const id = chatId();

    await run(chats.create(alice, { id, title: "Hi", spaceId: null }));
    expect(rows().chats.get(id)?.permissionMode).toBe("manual");

    await run(chats.update(alice, id, { permissionMode: "bypass" }));
    await run(chats.forward(alice, id, "/eve/v1/session/ses_1", get()));

    expect(modes.at(-1)).toBe("bypass");
  });

  test("refuses a mode that doesn't exist", async () => {
    const { chats } = setup();
    const id = chatId();

    expect(
      await outcome(
        chats.create(alice, { id, title: "Hi", spaceId: null, permissionMode: "yolo" }),
      ),
    ).toBe("Invalid");

    await run(chats.create(alice, { id, title: "Hi", spaceId: null, permissionMode: "auto" }));

    expect(await outcome(chats.update(alice, id, { permissionMode: "never" }))).toBe("Invalid");
  });
});

describe("joining spaces", () => {
  test("the maker joins; anyone in the workspace joins and leaves", async () => {
    const { chats, rows } = setup();
    const space = spaceId();

    await run(chats.createSpace(alice, { id: space, name: "Sales", color: "blue" }));
    expect(rows().members.has(`${space}:alice`)).toBe(true);

    await run(chats.joinSpace(bob, space));
    // Joining again changes nothing.
    await run(chats.joinSpace(bob, space));
    expect(rows().members.has(`${space}:bob`)).toBe(true);

    await run(chats.leaveSpace(bob, space));
    expect(rows().members.has(`${space}:bob`)).toBe(false);
    expect(await outcome(chats.leaveSpace(bob, space))).toBe("NotFound");
  });

  test("another workspace's space can't be joined", async () => {
    const { chats } = setup();
    const space = spaceId();

    await run(chats.createSpace(alice, { id: space, name: "Sales", color: "blue" }));

    expect(await outcome(chats.joinSpace(mallory, space))).toBe("NotFound");
  });
});
