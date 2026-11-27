import { describe, expect, test } from "bun:test";
import {
  Invalid,
  MEMORY_CORE_ID,
  NoActiveWorkspace,
  NotFound,
  UpstreamUnavailable,
} from "@crm/core/api";
import type { BrandResearch } from "@crm/core/brand";
import { memoryNamespace } from "@crm/memory";
import { createInMemoryStore } from "@crm/memory/testing";
import { createMemoryKv } from "@crm/core/kv";
import { Effect } from "effect";
import { makeMemory, toMemoryGraph } from "./Memory.ts";
import { createMemoryDirectory } from "./memory-directory-memory.ts";
import { createMemoryFactMirror } from "./memory-mirror-memory.ts";

const now = () => new Date("2026-11-26T12:00:00Z");

const CONTACT = "ctc_wile00000000000000000000";

const DEAL = "del_rockets00000000000000000";

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
  const copy = createMemoryFactMirror();
  const kv = createMemoryKv();

  const memory = makeMemory({
    store: options.store === false ? null : store,
    mirror: copy.mirror,
    kv,
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
        {
          id: "com_acme00000000000000000000",
          workspaceId: "ws1",
          name: "Acme",
          domain: "acme.test",
        },
        { id: "com_beta00000000000000000000", workspaceId: "ws1", name: "Beta Labs", domain: null },
        {
          id: "com_other0000000000000000000",
          workspaceId: "ws2",
          name: "Acme",
          domain: "acme.test",
        },
      ],
      contacts: [
        {
          id: CONTACT,
          workspaceId: "ws1",
          name: "Wile Coyote",
          title: "Head of Procurement",
          companyName: "Acme",
        },
      ],
      deals: [{ id: DEAL, workspaceId: "ws1", name: "Acme rockets", companyName: "Acme" }],
      users: { alice: "Alice" },
    }),
    prefix: "test",
    now,
    log: () => {},
  });

  return { memory, store, researched, copy, kv };
}

const alice = { userId: "alice", activeWorkspaceId: "ws1" };

const ACME = "com_acme00000000000000000000";

/** Copies run off the request path: wait (a bounded number of ticks) until `done` holds. */
async function eventually(done: () => boolean, ticks = 50): Promise<void> {
  if (done() || ticks === 0) {
    expect(done()).toBe(true);

    return;
  }

  await Bun.sleep(1);
  await eventually(done, ticks - 1);
}

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

    await memory.researchCompany("ws1", "com_acme00000000000000000000");
    await memory.researchCompany("ws1", "com_beta00000000000000000000");

    expect(researched).toEqual(["acme.test"]);
    expect(store.sources(ns("ws1", "com_acme00000000000000000000"))).toHaveLength(1);
    expect(store.context(ns("ws1", "com_acme00000000000000000000"))).toContain(
      "that Roadrunner Inc tracks",
    );
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

    const knowledge = await Effect.runPromise(memory.knowledge(alice, {}));

    expect(knowledge.enabled).toBe(true);
    expect(knowledge.facts.map((fact) => fact.text)).toContain("We close deals in Q4.");
    expect(knowledge.sources.map((source) => source.title)).toContain("Note from Alice");
    expect(knowledge.profile.map((fact) => fact.text)).toContain(
      "Description: Acme sells rockets to coyotes.",
    );

    const fact = knowledge.facts.find((entry) => entry.text === "We close deals in Q4.");

    await Effect.runPromise(memory.forget(alice, { factId: fact?.id ?? "" }));

    const after = await Effect.runPromise(memory.knowledge(alice, {}));

    expect(after.facts.map((entry) => entry.text)).not.toContain("We close deals in Q4.");
  });

  test("can't read another workspace or a company outside their own", async () => {
    const { memory } = setup();

    const outsider = await Effect.runPromise(
      Effect.flip(memory.knowledge({ userId: "mallory", activeWorkspaceId: "ws1" }, {})),
    );

    expect(outsider).toBeInstanceOf(NoActiveWorkspace);

    const foreign = await Effect.runPromise(
      Effect.flip(memory.knowledge(alice, { companyId: "com_other0000000000000000000" })),
    );

    expect(foreign).toBeInstanceOf(NotFound);

    const note = await Effect.runPromise(
      Effect.flip(
        memory.addNote(alice, { companyId: "com_other0000000000000000000", text: "Mine now" }),
      ),
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

    expect(await Effect.runPromise(memory.knowledge(alice, {}))).toEqual({
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
      companyId: "com_acme00000000000000000000",
      text: "Acme renews in March.",
    });
    await memory.agent.remember(
      { userId: "mallory", workspaceId: "ws2" },
      {
        kind: "agent_fact",
        companyId: "com_other0000000000000000000",
        text: "Acme owes us money.",
      },
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
      companyId: "com_acme00000000000000000000",
      text: "Acme's champion is Wile.",
    });

    const [old] = await (async () => {
      const result = await memory.agent.search(caller, {
        companyId: "com_acme00000000000000000000",
        query: "Acme champion Wile",
      });

      return result.ok ? result.value : [];
    })();

    await memory.agent.remember(caller, {
      kind: "agent_fact",
      companyId: "com_acme00000000000000000000",
      text: "Acme's champion is now Road.",
      replaces: old?.factId,
    });

    const knowledge = await Effect.runPromise(
      memory.knowledge(alice, { companyId: "com_acme00000000000000000000" }),
    );

    expect(knowledge.facts.map((fact) => fact.text)).toEqual(["Acme's champion is now Road."]);
  });

  test("a non-member or a foreign company is refused", async () => {
    const { memory } = setup();

    expect(
      await memory.agent.recall({ userId: "mallory", workspaceId: "ws1" }, "anything"),
    ).toMatchObject({ ok: false, status: 403 });

    expect(
      await memory.agent.remember(caller, {
        kind: "email",
        companyId: "com_other0000000000000000000",
        text: "x",
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("a removed company's memory is deleted", async () => {
    const { memory, store } = setup();

    await memory.agent.remember(caller, {
      kind: "agent_fact",
      companyId: "com_acme00000000000000000000",
      text: "x",
    });
    await memory.companyRemoved("ws1", "com_acme00000000000000000000");

    expect(store.namespaces()).not.toContain(ns("ws1", "com_acme00000000000000000000"));
  });
});

const graphFact = (id: string) => ({
  id,
  text: `Fact ${id}`,
  isStatic: false,
  isInference: false,
  isLatest: true,
  isForgotten: false,
  version: 1,
  createdAt: "2026-11-02T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
});

const graphSource = (sourceId: string, facts: ReturnType<typeof graphFact>[]) => ({
  sourceId,
  kind: "member_note" as const,
  title: sourceId,
  summary: null,
  createdAt: sourceId === "research" ? "2026-11-01T00:00:00Z" : "2026-11-03T00:00:00Z",
  updatedAt: "2026-11-03T00:00:00Z",
  facts,
});

describe("the memory graph", () => {
  test("draws each source with its facts, and search points back at the source", async () => {
    const { memory } = setup();

    await memory.researchWorkspace("ws1");
    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));

    const graph = await Effect.runPromise(memory.graph(alice, {}));

    expect(graph.documents.map((document) => document.documentType).toSorted()).toEqual([
      "member_note",
      "workspace",
    ]);
    expect(graph.totals.sources).toBe(2);

    const note = graph.documents.find((document) => document.documentType === "member_note");

    expect(note?.memories.map((fact) => fact.memory)).toEqual(["We close deals in Q4."]);

    const hits = await Effect.runPromise(memory.search(alice, { q: "close deals Q4" }));

    expect(hits[0]?.sourceId).toBe(note?.id);
  });

  test("puts the record's website research at the centre, with every other source linked to it", () => {
    const graph = toMemoryGraph(
      "ns",
      [
        graphSource("note", [graphFact("f3")]),
        graphSource("website-research", [graphFact("f1"), graphFact("f2")]),
        graphSource("chat", []),
      ],
      { kind: "company", title: "Roo Capital" },
    );

    const [core, ...sources] = graph.documents;

    expect(graph.documents.map((document) => document.id)).not.toContain(MEMORY_CORE_ID);
    expect(core).toMatchObject({
      id: "website-research",
      title: "Roo Capital",
      documentType: "company",
    });
    expect(core?.memories.map((memory) => [memory.id, memory.memoryRelations])).toEqual([
      ["f1", { chat: "extends" }],
      ["f2", null],
    ]);
    expect(sources.map((document) => document.id)).toEqual(["note", "chat"]);
    expect(sources[0]?.memories[0]?.memoryRelations).toEqual({ "website-research": "derives" });
  });

  test("draws a core for the record until its research lands", async () => {
    const graph = toMemoryGraph(
      "ns",
      [
        graphSource("research", [graphFact("f1"), graphFact("f2")]),
        graphSource("note", [graphFact("f3")]),
        graphSource("chat", []),
      ],
      { kind: "workspace", title: "Roadrunner" },
    );

    const [core, ...sources] = graph.documents;

    expect(core).toMatchObject({
      id: MEMORY_CORE_ID,
      title: "Roadrunner",
      documentType: "workspace",
      createdAt: "2026-11-01T00:00:00Z",
      memories: [],
    });

    const relations = Object.fromEntries(
      sources.flatMap((document) =>
        document.memories.map((memory) => [memory.id, memory.memoryRelations]),
      ),
    );

    expect(relations).toEqual({
      f1: { [MEMORY_CORE_ID]: "derives", chat: "extends" },
      f2: null,
      f3: { [MEMORY_CORE_ID]: "derives" },
    });
    expect(graph.totals).toEqual({ sources: 3, facts: 3 });

    expect(toMemoryGraph("ns", [], { kind: "workspace", title: "Roadrunner" }).documents).toEqual(
      [],
    );
  });

  test("is refused for a company outside the workspace", async () => {
    const { memory } = setup();

    const error = await Effect.runPromise(
      Effect.flip(memory.graph(alice, { companyId: "com_other0000000000000000000" })),
    );

    expect(error).toBeInstanceOf(NotFound);
  });
});

describe("a source", () => {
  test("opens with its text, and deleting it removes its facts", async () => {
    const { memory } = setup();

    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));

    const note = (await Effect.runPromise(memory.graph(alice, {}))).documents.find(
      (document) => document.documentType === "member_note",
    );

    const source = await Effect.runPromise(memory.source(alice, { id: note?.id ?? "" }));

    expect(source.content).toBe("We close deals in Q4.");
    expect(source.kind).toBe("member_note");

    await Effect.runPromise(memory.deleteSource(alice, { id: source.id }));

    expect((await Effect.runPromise(memory.graph(alice, {}))).documents).toEqual([]);

    const missing = await Effect.runPromise(Effect.flip(memory.source(alice, { id: source.id })));

    expect(missing).toBeInstanceOf(NotFound);
  });
});

describe("contact and deal memory", () => {
  test("a note on a contact or a deal stays in that record's own memory", async () => {
    const { memory, store } = setup();

    await Effect.runPromise(
      memory.addNote(alice, { contactId: CONTACT, text: "Wile prefers email." }),
    );
    await Effect.runPromise(memory.addNote(alice, { dealId: DEAL, text: "Budget is 40k." }));

    const contact = await Effect.runPromise(memory.knowledge(alice, { contactId: CONTACT }));
    const deal = await Effect.runPromise(memory.knowledge(alice, { dealId: DEAL }));
    const workspace = await Effect.runPromise(memory.knowledge(alice, {}));

    expect(contact.facts.map((fact) => fact.text)).toEqual(["Wile prefers email."]);
    expect(deal.facts.map((fact) => fact.text)).toEqual(["Budget is 40k."]);
    expect(workspace.facts).toEqual([]);
    expect(store.namespaces()).toContain(
      memoryNamespace("test", "ws1", { type: "contact", contactId: CONTACT }),
    );
  });

  test("the graph's core is the record", async () => {
    const { memory } = setup();

    await Effect.runPromise(memory.addNote(alice, { dealId: DEAL, text: "Budget is 40k." }));

    const graph = await Effect.runPromise(memory.graph(alice, { dealId: DEAL }));

    expect(graph.documents[0]).toMatchObject({
      id: MEMORY_CORE_ID,
      title: "Acme rockets",
      documentType: "deal",
    });
  });

  test("an unknown record, or more than one record, is refused", async () => {
    const { memory } = setup();

    const missing = await Effect.runPromise(
      Effect.flip(memory.knowledge(alice, { contactId: "ctc_none00000000000000000000" })),
    );

    expect(missing).toBeInstanceOf(NotFound);

    const both = await Effect.runPromise(
      Effect.flip(memory.knowledge(alice, { contactId: CONTACT, dealId: DEAL })),
    );

    expect(both).toBeInstanceOf(Invalid);

    const research = await Effect.runPromise(
      Effect.flip(memory.research(alice, { contactId: CONTACT })),
    );

    expect(research).toBeInstanceOf(Invalid);
  });

  test("the agent remembers about a contact; another workspace can't reach it", async () => {
    const { memory } = setup();

    await memory.agent.remember(
      { userId: "alice", workspaceId: "ws1" },
      { kind: "agent_fact", contactId: CONTACT, text: "Wile reports to the CFO." },
    );

    const hits = await memory.agent.search(
      { userId: "alice", workspaceId: "ws1" },
      { contactId: CONTACT, query: "Wile reports" },
    );

    expect(hits.ok && hits.value.map((hit) => hit.text)).toEqual(["Wile reports to the CFO."]);

    expect(
      await memory.agent.search(
        { userId: "mallory", workspaceId: "ws2" },
        { contactId: CONTACT, query: "Wile" },
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  test("contact and deal facts are not copied for ⌘K", async () => {
    const { memory, copy } = setup();

    await Effect.runPromise(
      memory.addNote(alice, { contactId: CONTACT, text: "Wile prefers email." }),
    );
    await Effect.runPromise(memory.knowledge(alice, { contactId: CONTACT }));
    await Bun.sleep(5);

    expect(copy.rows()).toEqual([]);
  });
});

describe("the fact copy ⌘K searches", () => {
  test("reading a company's memory copies its facts, and a forgotten fact leaves at once", async () => {
    const { memory, copy } = setup();

    await Effect.runPromise(
      memory.addNote(alice, { companyId: ACME, text: "Uses Postgres.\nBudget is 10k." }),
    );
    await Effect.runPromise(memory.knowledge(alice, { companyId: ACME }));
    await eventually(() => copy.rows().length === 2);

    expect(
      copy
        .rows()
        .map((row) => [row.workspaceId, row.companyId, row.text])
        .toSorted(),
    ).toEqual([
      ["ws1", ACME, "Budget is 10k."],
      ["ws1", ACME, "Uses Postgres."],
    ]);

    const postgres = copy.rows().find((row) => row.text === "Uses Postgres.");

    await Effect.runPromise(memory.forget(alice, { companyId: ACME, factId: postgres?.id ?? "" }));

    expect(copy.rows().map((row) => row.text)).toEqual(["Budget is 10k."]);
  });

  test("a write makes the copy stale, so the next look copies the new facts", async () => {
    const { memory, copy } = setup();

    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));
    await Effect.runPromise(memory.knowledge(alice, {}));
    await eventually(() => copy.rows().length === 1);

    await Effect.runPromise(memory.addNote(alice, { text: "Our CFO is Dana." }));
    await Effect.runPromise(memory.knowledge(alice, {}));
    await eventually(() => copy.rows().length === 2);

    expect(copy.rows().every((row) => row.companyId === null)).toBe(true);
  });

  test("a fresh copy is not read again until it goes stale", async () => {
    const { memory, copy, store } = setup();

    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));
    await Effect.runPromise(memory.knowledge(alice, {}));
    await eventually(() => copy.rows().length === 1);

    // Written behind the service's back: nothing marks the copy stale.
    await store.putSource(ns("ws1"), {
      sourceId: "outside",
      workspaceId: "ws1",
      kind: "member_note",
      title: "Outside",
      content: "Not copied yet.",
      supportingContext: "",
    });
    await Effect.runPromise(memory.knowledge(alice, {}));
    await Bun.sleep(5);

    expect(copy.rows()).toHaveLength(1);
  });

  test("refresh copies the workspace's memories; a non-member is refused", async () => {
    const { memory, copy } = setup();

    await Effect.runPromise(memory.addNote(alice, { text: "We close deals in Q4." }));
    await Effect.runPromise(memory.addNote(alice, { companyId: ACME, text: "Uses Postgres." }));
    await Effect.runPromise(memory.refresh(alice));
    await eventually(() => copy.rows().length === 2);

    expect(
      copy
        .rows()
        .map((row) => row.companyId)
        .toSorted(),
    ).toEqual([ACME, null]);

    const outsider = await Effect.runPromise(
      Effect.flip(memory.refresh({ userId: "mallory", activeWorkspaceId: "ws1" })),
    );

    expect(outsider).toBeInstanceOf(NoActiveWorkspace);
  });
});
