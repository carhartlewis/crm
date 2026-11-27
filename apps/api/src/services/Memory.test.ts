import { describe, expect, test } from "bun:test";
import { Invalid, NoActiveWorkspace, NotFound, UpstreamUnavailable } from "@crm/core/api";
import type { BrandResearch } from "@crm/core/brand";
import { memoryNamespace } from "@crm/memory";
import { createInMemoryStore } from "@crm/memory/testing";
import { Effect } from "effect";
import { makeMemory } from "./Memory.ts";
import { createMemoryDirectory } from "./memory-directory-memory.ts";

const now = () => new Date("2026-11-26T12:00:00Z");

const acme: BrandResearch = {
  domain: "acme.test",
  name: "Acme",
  description: "Acme sells rockets to coyotes.",
  slogan: null,
  industries: ["Aerospace — Rockets"],
  address: "1 Desert Road, Arizona",
  socials: [],
  links: {},
  email: null,
  phone: null,
  stock: null,
  homepage: "# Acme\n\nFast rockets, delivered.",
};

function ns(workspaceId: string, companyId?: string) {
  return memoryNamespace(
    "test",
    workspaceId,
    companyId ? { type: "company", companyId } : { type: "workspace" },
  );
}

function setup(options: { store?: boolean } = {}) {
  const store = createInMemoryStore({ now });
  const researched: string[] = [];

  const memory = makeMemory({
    store: options.store === false ? null : store,
    researcher: {
      research: async (website) => {
        researched.push(website);

        return website.includes("acme") ? acme : null;
      },
    },
    directory: createMemoryDirectory({
      members: ["ws1:alice", "ws2:mallory"],
      workspaces: [
        { id: "ws1", name: "Roadrunner Inc", website: "https://acme.test" },
        { id: "ws2", name: "Other", website: "https://other.test" },
      ],
      companies: [
        { id: "c-acme", workspaceId: "ws1", name: "Acme", domain: "acme.test" },
        { id: "c-beta", workspaceId: "ws1", name: "Beta Labs", domain: null },
        { id: "c-other", workspaceId: "ws2", name: "Acme", domain: "acme.test" },
      ],
      users: { alice: "Alice" },
    }),
    prefix: "test",
    now,
    log: () => {},
  });

  return { memory, store, researched };
}

const alice = { userId: "alice", activeWorkspaceId: "ws1" };

describe("website research", () => {
  test("a new workspace's website becomes one research source in its memory", async () => {
    const { memory, store } = setup();

    await memory.researchWorkspace("ws1");
    await memory.researchWorkspace("ws1");

    const sources = store.sources(ns("ws1"));

    expect(sources).toHaveLength(1);
    expect(sources[0]?.kind).toBe("website_research");
    expect(sources[0]?.content).toContain("Acme sells rockets to coyotes.");
    expect(sources[0]?.content).toContain("retrieved on 2026-11-26");
    expect(store.context(ns("ws1"))).toContain("Roadrunner Inc");
  });

  test("a company is researched into its own namespace, only when it has a domain", async () => {
    const { memory, store, researched } = setup();

    await memory.researchCompany("ws1", "c-acme");
    await memory.researchCompany("ws1", "c-beta");

    expect(researched).toEqual(["acme.test"]);
    expect(store.sources(ns("ws1", "c-acme"))).toHaveLength(1);
    expect(store.context(ns("ws1", "c-acme"))).toContain("that Roadrunner Inc tracks");
  });

  test("nothing is written when research finds nothing", async () => {
    const { memory, store } = setup();

    await memory.researchWorkspace("ws2");

    expect(store.namespaces()).toEqual([]);
  });
});

describe("members", () => {
  test("read notes and research, and forget a fact", async () => {
    const { memory } = setup();

    await memory.researchWorkspace("ws1");
    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));

    const knowledge = await Effect.runPromise(memory.workspace(alice));

    expect(knowledge.enabled).toBe(true);
    expect(knowledge.facts.map((fact) => fact.text)).toContain("We close deals in Q4.");
    expect(knowledge.sources.map((source) => source.title)).toContain("Note from Alice");
    expect(knowledge.profile.map((fact) => fact.text)).toContain(
      "Description: Acme sells rockets to coyotes.",
    );

    const fact = knowledge.facts.find((entry) => entry.text === "We close deals in Q4.");

    await Effect.runPromise(memory.forget(alice, { factId: fact?.id ?? "" }));

    const after = await Effect.runPromise(memory.workspace(alice));

    expect(after.facts.map((entry) => entry.text)).not.toContain("We close deals in Q4.");
  });

  test("can't read another workspace or a company outside their own", async () => {
    const { memory } = setup();

    const outsider = await Effect.runPromise(
      Effect.flip(memory.workspace({ userId: "mallory", activeWorkspaceId: "ws1" })),
    );

    expect(outsider).toBeInstanceOf(NoActiveWorkspace);

    const foreign = await Effect.runPromise(Effect.flip(memory.company(alice, "c-other")));

    expect(foreign).toBeInstanceOf(NotFound);

    const note = await Effect.runPromise(
      Effect.flip(memory.addNote(alice, { companyId: "c-other", text: "Mine now" })),
    );

    expect(note).toBeInstanceOf(NotFound);
  });

  test("an empty note is refused", async () => {
    const { memory } = setup();

    const error = await Effect.runPromise(Effect.flip(memory.addNote(alice, { text: "  " })));

    expect(error).toBeInstanceOf(Invalid);
  });

  test("with memory off, reads are empty and writes say why", async () => {
    const { memory } = setup({ store: false });

    expect(await Effect.runPromise(memory.workspace(alice))).toEqual({
      enabled: false,
      profile: [],
      facts: [],
      sources: [],
    });

    const error = await Effect.runPromise(Effect.flip(memory.addNote(alice, { text: "Hi" })));

    expect(error).toBeInstanceOf(UpstreamUnavailable);
  });
});

describe("the agent", () => {
  const caller = { userId: "alice", workspaceId: "ws1" };

  test("recalls the workspace and the companies a message names, nothing from elsewhere", async () => {
    const { memory } = setup();

    await memory.agent.remember(caller, { kind: "agent_fact", text: "We sell anvils." });
    await memory.agent.remember(caller, {
      kind: "agent_fact",
      companyId: "c-acme",
      text: "Acme renews in March.",
    });
    await memory.agent.remember(
      { userId: "mallory", workspaceId: "ws2" },
      { kind: "agent_fact", companyId: "c-other", text: "Acme owes us money." },
    );

    const result = await memory.agent.recall(caller, "When does Acme renew?");

    if (!result.ok) throw new Error(result.message);

    expect(result.value.workspace.name).toBe("Roadrunner Inc");
    expect(result.value.workspace.profile).toContain("We sell anvils.");
    expect(result.value.companies).toHaveLength(1);
    expect(result.value.companies[0]?.profile).toContain("Acme renews in March.");
    expect(JSON.stringify(result.value)).not.toContain("owes us money");
  });

  test("a replacing fact forgets the one it corrects", async () => {
    const { memory } = setup();

    await memory.agent.remember(caller, {
      kind: "agent_fact",
      companyId: "c-acme",
      text: "Acme's champion is Wile.",
    });

    const [old] = await (async () => {
      const result = await memory.agent.search(caller, {
        companyId: "c-acme",
        query: "Acme champion Wile",
      });

      return result.ok ? result.value : [];
    })();

    await memory.agent.remember(caller, {
      kind: "agent_fact",
      companyId: "c-acme",
      text: "Acme's champion is now Road.",
      replaces: old?.factId,
    });

    const knowledge = await Effect.runPromise(memory.company(alice, "c-acme"));

    expect(knowledge.facts.map((fact) => fact.text)).toEqual(["Acme's champion is now Road."]);
  });

  test("a chat is one source that each save replaces", async () => {
    const { memory, store } = setup();

    await memory.agent.saveChat(caller, { sessionId: "s-1", transcript: "Alice: hi" });
    await memory.agent.saveChat(caller, {
      sessionId: "s-1",
      transcript: "Alice: hi\nAssistant: hello",
    });

    const chats = store.sources(ns("ws1")).filter((source) => source.kind === "chat");

    expect(chats).toHaveLength(1);
    expect(chats[0]?.content).toContain("Assistant: hello");
  });

  test("a non-member or a foreign company is refused", async () => {
    const { memory } = setup();

    expect(
      await memory.agent.recall({ userId: "mallory", workspaceId: "ws1" }, "anything"),
    ).toMatchObject({ ok: false, status: 403 });

    expect(
      await memory.agent.remember(caller, { kind: "email", companyId: "c-other", text: "x" }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("a removed company's memory is deleted", async () => {
    const { memory, store } = setup();

    await memory.agent.remember(caller, { kind: "agent_fact", companyId: "c-acme", text: "x" });
    await memory.companyRemoved("ws1", "c-acme");

    expect(store.namespaces()).not.toContain(ns("ws1", "c-acme"));
  });
});
