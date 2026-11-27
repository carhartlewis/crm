import {
  Invalid,
  type Knowledge,
  type MemoryGraph,
  type MemorySourceDetail,
  type MemoryHit,
  NoActiveWorkspace,
  NotFound,
  UpstreamUnavailable,
} from "@crm/core/api";
import { isCompanyId } from "@crm/core/company";
import { MAX_NOTE_CHARACTERS, memoryNoteError } from "@crm/core/memory";
import { createContextDev, type CompanyResearcher } from "@crm/core/brand";
import type { Db } from "@crm/core/db";
import {
  EMPTY_PROFILE,
  type GraphSource,
  type MemorySource,
  type MemoryStore,
  type MemorySubject,
  memoryNamespace,
  memoryPrefix,
  mentionedCompanies,
  researchText,
} from "@crm/memory";
import type { CompanyRecall, Recall } from "@crm/memory/recall";
import { createSupermemoryStore } from "@crm/memory/supermemory";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";
import type { Actor } from "./Companies.ts";
import { Database } from "./Database.ts";

/**
 * Workspace and company memory (ADR 0014). Supermemory stores the sources and extracts the
 * facts; this service checks membership, picks the namespace, and writes the sources: website
 * research when a workspace or company is created, members' notes, and what the agent sends.
 * Deciding what a chat adds (Jev) is the agent's job, not the API's.
 */

export interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
}

export interface WorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly website: string;
}

/** The CRM rows memory reads. Prisma in production, a fake in tests. */
export interface MemoryDirectory {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  workspace(id: string): Promise<WorkspaceRow | null>;
  company(workspaceId: string, id: string): Promise<CompanyRow | null>;
  companies(workspaceId: string): Promise<readonly CompanyRow[]>;
  userName(id: string): Promise<string | null>;
}

export interface MemoryDependencies {
  /** Null turns memory off: reads are empty and writes fail with a clear message. */
  readonly store: MemoryStore | null;
  readonly researcher: CompanyResearcher | null;
  readonly directory: MemoryDirectory;
  readonly prefix: string;
  readonly now: () => Date;
  readonly log: (message: string, cause?: unknown) => void;
}

/** The caller of an agent endpoint: a verified MCP token's user and workspace. */
export interface AgentCaller {
  readonly userId: string;
  readonly workspaceId: string;
}

export type AgentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: 400 | 403 | 404 | 502; readonly message: string };

export interface Hit {
  readonly factId: string;
  readonly text: string;
  readonly companyId: string | null;
}

type Target = { readonly companyId?: string | undefined };

type MemoryError = NoActiveWorkspace | NotFound | Invalid | UpstreamUnavailable;

export interface MemoryService {
  readonly workspace: (actor: Actor) => Effect.Effect<Knowledge, MemoryError>;
  readonly company: (actor: Actor, id: string) => Effect.Effect<Knowledge, MemoryError>;
  readonly graph: (actor: Actor, input: Target) => Effect.Effect<MemoryGraph, MemoryError>;
  readonly source: (
    actor: Actor,
    input: Target & { id: string },
  ) => Effect.Effect<MemorySourceDetail, MemoryError>;
  readonly deleteSource: (
    actor: Actor,
    input: Target & { id: string },
  ) => Effect.Effect<void, MemoryError>;
  readonly search: (
    actor: Actor,
    input: Target & { q: string },
  ) => Effect.Effect<readonly MemoryHit[], MemoryError>;
  readonly addNote: (
    actor: Actor,
    input: Target & { text: string },
  ) => Effect.Effect<void, MemoryError>;
  readonly research: (actor: Actor, input: Target) => Effect.Effect<void, MemoryError>;
  readonly forget: (
    actor: Actor,
    input: Target & { factId: string },
  ) => Effect.Effect<void, MemoryError>;

  /** Background work after a write elsewhere. Never throws; failures are logged. */
  readonly researchWorkspace: (workspaceId: string) => Promise<void>;
  readonly researchCompany: (workspaceId: string, companyId: string) => Promise<void>;
  readonly companyRemoved: (workspaceId: string, companyId: string) => Promise<void>;

  readonly agent: {
    readonly recall: (caller: AgentCaller, query: string) => Promise<AgentResult<Recall>>;
    readonly companies: (caller: AgentCaller) => Promise<AgentResult<readonly CompanyRow[]>>;
    readonly search: (
      caller: AgentCaller,
      input: Target & { query: string },
    ) => Promise<AgentResult<readonly Hit[]>>;
    readonly remember: (
      caller: AgentCaller,
      input: Target & { text: string; kind: "agent_fact" | "email"; replaces?: string | undefined },
    ) => Promise<AgentResult<null>>;
    readonly forget: (
      caller: AgentCaller,
      input: Target & { factId: string },
    ) => Promise<AgentResult<null>>;
    readonly saveChat: (
      caller: AgentCaller,
      input: { sessionId: string; transcript: string },
    ) => Promise<AgentResult<null>>;
  };
}

export const MAX_CHAT_CHARACTERS = 60_000;
const RESEARCH_SOURCE = "website-research";
const FACT_LIMIT = 100;
const SOURCE_LIMIT = 20;
const RECALL_COMPANIES = 3;
const GRAPH_SOURCES = 60;

/** Sources and facts in the shape `@supermemory/memory-graph` draws. */
export function toMemoryGraph(spaceId: string, sources: readonly GraphSource[]): MemoryGraph {
  return {
    documents: sources.map((source) => ({
      id: source.sourceId,
      title: source.title,
      summary: source.summary,
      documentType: source.kind ?? "source",
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      memories: source.facts.map((fact) => ({
        id: fact.id,
        memory: fact.text,
        content: null,
        isStatic: fact.isStatic,
        spaceId,
        isLatest: fact.isLatest,
        isForgotten: fact.isForgotten,
        forgetAfter: null,
        forgetReason: null,
        version: fact.version,
        parentMemoryId: null,
        rootMemoryId: null,
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt,
        relation: null,
        updatesMemoryId: null,
        nextVersionId: null,
        memoryRelations: null,
      })),
    })),
    totals: {
      sources: sources.length,
      facts: sources.reduce(
        (total, source) =>
          total + source.facts.filter((fact) => fact.isLatest && !fact.isForgotten).length,
        0,
      ),
    },
  };
}

const noWorkspace = () =>
  new NoActiveWorkspace({ message: "Choose a workspace you belong to first" });

const companyNotFound = () => new NotFound({ message: "Company not found" });

const unavailable = () =>
  new UpstreamUnavailable({ message: "Memory is unavailable right now. Try again." });

const memoryOff = () =>
  new UpstreamUnavailable({ message: "Memory isn't set up on this server (SUPERMEMORY_API_KEY)." });

/** A chat session id from the agent. Company ids are checked with `isCompanyId`. */
const SAFE_ID = /^[a-zA-Z0-9-]{1,64}$/;

function subjectOf(target: Target): MemorySubject {
  return target.companyId
    ? { type: "company", companyId: target.companyId }
    : { type: "workspace" };
}

function workspaceContext(workspace: WorkspaceRow) {
  return `Memory of ${workspace.name} (${workspace.website}), the company that uses this CRM. Facts describe ${workspace.name}: what it sells, its people, customers, tools and ways of working.`;
}

function companyContext(workspace: WorkspaceRow | null, company: CompanyRow) {
  const owner = workspace?.name ?? "the workspace";
  const site = company.domain ? ` (${company.domain})` : "";

  return `Memory of ${company.name}${site}, a customer, prospect or partner that ${owner} tracks in its CRM. Facts describe ${company.name}: its people and their roles, needs, deals, tools, decisions and history with ${owner}.`;
}

async function put(memory: MemoryStore, ns: string, source: MemorySource) {
  await memory.describeNamespace(ns, source.supportingContext);
  await memory.putSource(ns, source);
}

function toCompany(row: { id: string; name: string; domain: string | null }): CompanyRow {
  return { id: row.id, name: row.name, domain: row.domain };
}

export function makeMemory(deps: MemoryDependencies): MemoryService {
  const { store, directory } = deps;
  const researching = new Set<string>();

  const namespace = (workspaceId: string, subject: MemorySubject) =>
    memoryNamespace(deps.prefix, workspaceId, subject);

  /** The membership check every call starts with. */
  const member = (actor: Actor) =>
    Effect.gen(function* () {
      const workspaceId = actor.activeWorkspaceId;

      if (!workspaceId) return yield* Effect.fail(noWorkspace());

      const ok = yield* Effect.promise(() => directory.isMember(workspaceId, actor.userId));

      return ok ? workspaceId : yield* Effect.fail(noWorkspace());
    });

  /** A store call; failures are logged and become `UpstreamUnavailable`. */
  const stored = <A>(label: string, work: (store: MemoryStore) => Promise<A>) =>
    store
      ? Effect.tryPromise({ try: () => work(store), catch: (cause) => cause }).pipe(
          Effect.tapError((cause) => Effect.sync(() => deps.log(`memory: ${label} failed`, cause))),
          Effect.mapError(unavailable),
        )
      : Effect.fail(memoryOff());

  const target = (workspaceId: string, input: Target) =>
    Effect.gen(function* () {
      if (!input.companyId) return namespace(workspaceId, { type: "workspace" });

      const { companyId } = input;

      if (!isCompanyId(companyId)) return yield* Effect.fail(companyNotFound());

      const company = yield* Effect.promise(() => directory.company(workspaceId, companyId));

      return company
        ? namespace(workspaceId, subjectOf(input))
        : yield* Effect.fail(companyNotFound());
    });

  const knowledge = (ns: string) =>
    store
      ? stored("read", async (memory) => {
          const [profile, page, sources] = await Promise.all([
            memory.profile(ns),
            memory.listFacts(ns, { cursor: null, limit: FACT_LIMIT }),
            memory.listSources(ns, SOURCE_LIMIT),
          ]);

          const lasting = [...profile.static, ...profile.dynamic];
          const seen = new Set<string>();

          return {
            enabled: true,
            profile: lasting.flatMap((entry) => {
              if (seen.has(entry.factId)) return [];

              seen.add(entry.factId);

              return [{ id: entry.factId, text: entry.text }];
            }),
            facts: page.facts.map((fact) => ({
              id: fact.id,
              text: fact.text,
              isStatic: fact.isStatic,
              isInference: fact.isInference,
              createdAt: fact.createdAt,
            })),
            sources: sources.map((source) => ({
              id: source.sourceId,
              kind: source.kind,
              title: source.title,
              status: source.status,
              updatedAt: source.updatedAt,
            })),
          } satisfies Knowledge;
        })
      : Effect.succeed<Knowledge>({ enabled: false, profile: [], facts: [], sources: [] });

  /** Writes the website research for a subject, once at a time per namespace. */
  const runResearch = async (
    workspaceId: string,
    subject: MemorySubject,
    website: string | null,
    supportingContext: string,
  ) => {
    if (!store || !deps.researcher || !website) return;

    const ns = namespace(workspaceId, subject);

    if (researching.has(ns)) return;

    researching.add(ns);

    try {
      const found = await deps.researcher.research(website);
      const content = found && researchText(found, deps.now());

      if (!found || !content) {
        deps.log(`memory: no research found for ${website}`);

        return;
      }

      await put(store, ns, {
        sourceId: RESEARCH_SOURCE,
        workspaceId,
        kind: "website_research",
        title: `Website research: ${found.domain}`,
        content,
        supportingContext,
      });
    } catch (cause) {
      deps.log(`memory: research for ${website} failed`, cause);
    } finally {
      researching.delete(ns);
    }
  };

  const researchWorkspace = async (workspaceId: string) => {
    try {
      const workspace = await directory.workspace(workspaceId);

      if (workspace) {
        await runResearch(
          workspaceId,
          { type: "workspace" },
          workspace.website,
          workspaceContext(workspace),
        );
      }
    } catch (cause) {
      deps.log("memory: workspace research failed", cause);
    }
  };

  const researchCompany = async (workspaceId: string, companyId: string) => {
    try {
      const [workspace, company] = await Promise.all([
        directory.workspace(workspaceId),
        directory.company(workspaceId, companyId),
      ]);

      if (company?.domain) {
        await runResearch(
          workspaceId,
          { type: "company", companyId },
          company.domain,
          companyContext(workspace, company),
        );
      }
    } catch (cause) {
      deps.log("memory: company research failed", cause);
    }
  };

  const contextFor = async (workspaceId: string, input: Target) => {
    const workspace = await directory.workspace(workspaceId);

    if (!input.companyId) return workspace ? workspaceContext(workspace) : "";

    const company = await directory.company(workspaceId, input.companyId);

    return company ? companyContext(workspace, company) : "";
  };

  const writeNote = async (
    memory: MemoryStore,
    workspaceId: string,
    input: Target & { text: string; kind: MemorySource["kind"]; title: string },
  ) => {
    const ns = namespace(workspaceId, subjectOf(input));

    await put(memory, ns, {
      sourceId: `${input.kind === "member_note" ? "note" : input.kind}-${crypto.randomUUID()}`,
      workspaceId,
      kind: input.kind,
      title: input.title,
      content: input.text,
      supportingContext: await contextFor(workspaceId, input),
    });
  };

  // Agent endpoints: the token already names the workspace; membership is checked again here.
  const agentCall = async <T>(
    caller: AgentCaller,
    work: (memory: MemoryStore) => Promise<AgentResult<T>>,
  ): Promise<AgentResult<T>> => {
    if (!store) return { ok: false, status: 502, message: "Memory isn't set up." };

    if (!(await directory.isMember(caller.workspaceId, caller.userId))) {
      return { ok: false, status: 403, message: "Not a member of this workspace." };
    }

    try {
      return await work(store);
    } catch (cause) {
      deps.log("memory: agent call failed", cause);

      return { ok: false, status: 502, message: "Memory is unavailable right now." };
    }
  };

  const agentTarget = async (caller: AgentCaller, input: Target) => {
    if (!input.companyId) return true;

    return (
      isCompanyId(input.companyId) &&
      (await directory.company(caller.workspaceId, input.companyId)) !== null
    );
  };

  /** Recall never fails a turn: a store failure leaves that part empty. */
  const quietly = async <A>(fallback: A, work: () => Promise<A>) => {
    try {
      return await work();
    } catch (cause) {
      deps.log("memory: recall part failed", cause);

      return fallback;
    }
  };

  return {
    workspace: (actor) =>
      Effect.flatMap(member(actor), (workspaceId) =>
        knowledge(namespace(workspaceId, { type: "workspace" })),
      ),

    graph: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, input);

        if (!store) return { documents: [], totals: { sources: 0, facts: 0 } };

        const sources = yield* stored("graph", (memory) => memory.graph(ns, GRAPH_SOURCES));

        return toMemoryGraph(ns, sources);
      }),

    source: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, input);
        const found = yield* stored("source", (memory) => memory.getSource(ns, input.id));

        if (!found) return yield* Effect.fail(new NotFound({ message: "Source not found" }));

        return {
          id: found.sourceId,
          kind: found.kind,
          title: found.title,
          status: found.status,
          content: found.content,
          createdAt: found.createdAt,
          updatedAt: found.updatedAt,
        };
      }),

    deleteSource: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, input);

        yield* stored("delete source", (memory) => memory.deleteSource(ns, input.id));
      }),

    search: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, input);
        const query = input.q.trim().slice(0, 500);

        if (!query || !store) return [];

        const hits = yield* stored("search", (memory) =>
          memory.search(ns, { query, limit: 12, threshold: 0.3 }),
        );

        return hits.map((hit) => ({ id: hit.factId, text: hit.text, sourceId: hit.sourceId }));
      }),

    company: (actor, id) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, { companyId: id });

        return yield* knowledge(ns);
      }),

    addNote: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const text = input.text.trim();

        const problem = memoryNoteError(text);

        if (problem) return yield* Effect.fail(new Invalid({ message: problem }));

        yield* target(workspaceId, input);

        const author = yield* Effect.promise(() => directory.userName(actor.userId));

        yield* stored("note", (memory) =>
          writeNote(memory, workspaceId, {
            ...input,
            text,
            kind: "member_note",
            title: `Note from ${author ?? "a member"}`,
          }),
        );
      }),

    research: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);

        yield* target(workspaceId, input);

        if (!store) return yield* Effect.fail(memoryOff());

        if (!deps.researcher) {
          return yield* Effect.fail(
            new UpstreamUnavailable({
              message: "Website research isn't set up on this server (CONTEXT_DEV_API_KEY).",
            }),
          );
        }

        // context.dev can take half a minute on a cold domain; the page shows the source when
        // it lands.
        void (input.companyId
          ? researchCompany(workspaceId, input.companyId)
          : researchWorkspace(workspaceId));
      }),

    forget: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const ns = yield* target(workspaceId, input);

        yield* stored("forget", (memory) => memory.forgetFacts(ns, [input.factId]));
      }),

    researchWorkspace,
    researchCompany,

    async companyRemoved(workspaceId, companyId) {
      if (!store || !isCompanyId(companyId)) return;

      try {
        await store.deleteNamespace(namespace(workspaceId, { type: "company", companyId }));
      } catch (cause) {
        deps.log("memory: deleting a company's memory failed", cause);
      }
    },

    agent: {
      recall: (caller, query) =>
        agentCall(caller, async (memory) => {
          const [workspace, companies] = await Promise.all([
            directory.workspace(caller.workspaceId),
            directory.companies(caller.workspaceId),
          ]);

          const own = namespace(caller.workspaceId, { type: "workspace" });
          const text = query.slice(0, 1_000);
          const named = mentionedCompanies(text, companies).slice(0, RECALL_COMPANIES);

          const [profile, relevant, recalled] = await Promise.all([
            quietly(EMPTY_PROFILE, () => memory.profile(own)),
            quietly([], () =>
              text.trim() ? memory.search(own, { query: text, limit: 6 }) : Promise.resolve([]),
            ),
            Promise.all(
              named.map(async (company): Promise<CompanyRecall> => {
                const ns = namespace(caller.workspaceId, {
                  type: "company",
                  companyId: company.id,
                });

                const [companyProfile, hits] = await Promise.all([
                  quietly(EMPTY_PROFILE, () => memory.profile(ns)),
                  quietly([], () => memory.search(ns, { query: text, limit: 5 })),
                ]);

                return {
                  id: company.id,
                  name: company.name,
                  domain: company.domain,
                  profile: [...companyProfile.static, ...companyProfile.dynamic]
                    .slice(0, 12)
                    .map((entry) => entry.text),
                  relevant: hits.map((hit) => hit.text),
                };
              }),
            ),
          ]);

          return {
            ok: true,
            value: {
              workspace: {
                name: workspace?.name ?? "",
                profile: [...profile.static, ...profile.dynamic]
                  .slice(0, 15)
                  .map((entry) => entry.text),
                relevant: relevant.map((hit) => hit.text),
              },
              companies: recalled,
            },
          };
        }),

      companies: (caller) =>
        agentCall(caller, async () => ({
          ok: true,
          value: await directory.companies(caller.workspaceId),
        })),

      search: (caller, input) =>
        agentCall(caller, async (memory) => {
          if (!(await agentTarget(caller, input))) {
            return { ok: false, status: 404, message: "No such company in this workspace." };
          }

          const hits = await memory.search(namespace(caller.workspaceId, subjectOf(input)), {
            query: input.query.slice(0, 1_000),
            limit: 10,
          });

          return {
            ok: true,
            value: hits.map((hit) => ({
              factId: hit.factId,
              text: hit.text,
              companyId: input.companyId ?? null,
            })),
          };
        }),

      remember: (caller, input) =>
        agentCall(caller, async (memory) => {
          const text = input.text.trim();

          if (!text || text.length > MAX_NOTE_CHARACTERS) {
            return { ok: false, status: 400, message: "A fact must be 1 to 4,000 characters." };
          }

          if (!(await agentTarget(caller, input))) {
            return { ok: false, status: 404, message: "No such company in this workspace." };
          }

          const ns = namespace(caller.workspaceId, subjectOf(input));

          if (input.replaces) await memory.forgetFacts(ns, [input.replaces]);

          await writeNote(memory, caller.workspaceId, {
            ...input,
            text,
            title: input.kind === "email" ? "Sent email" : "Remembered by the agent",
          });

          return { ok: true, value: null };
        }),

      forget: (caller, input) =>
        agentCall(caller, async (memory) => {
          if (!(await agentTarget(caller, input))) {
            return { ok: false, status: 404, message: "No such company in this workspace." };
          }

          await memory.forgetFacts(namespace(caller.workspaceId, subjectOf(input)), [input.factId]);

          return { ok: true, value: null };
        }),

      saveChat: (caller, input) =>
        agentCall(caller, async (memory) => {
          if (!SAFE_ID.test(input.sessionId)) {
            return { ok: false, status: 400, message: "Invalid session id." };
          }

          // The latest part of a long chat matters most; keep its tail.
          const transcript = input.transcript.trim().slice(-MAX_CHAT_CHARACTERS);

          if (!transcript) return { ok: true, value: null };

          const [author, workspace] = await Promise.all([
            directory.userName(caller.userId),
            directory.workspace(caller.workspaceId),
          ]);

          await put(memory, namespace(caller.workspaceId, { type: "workspace" }), {
            sourceId: `chat-${input.sessionId}`,
            workspaceId: caller.workspaceId,
            kind: "chat",
            title: `Chat with ${author ?? "a member"}, ${deps.now().toISOString().slice(0, 10)}`,
            content: transcript,
            supportingContext: workspace ? workspaceContext(workspace) : "",
          });

          return { ok: true, value: null };
        }),
    },
  };
}

/** The Prisma 8 directory. */
export function prismaMemoryDirectory(db: Db): MemoryDirectory {
  const orm = db.orm.public;

  return {
    isMember: async (workspaceId, userId) =>
      (await orm.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    workspace: async (id) => {
      const row = await orm.Workspace.where({ id }).first();

      return row ? { id: row.id, name: row.name, website: row.website } : null;
    },
    company: async (workspaceId, id) => {
      const row = await orm.Company.where({ workspaceId, id }).first();

      return row ? toCompany(row) : null;
    },
    companies: async (workspaceId) =>
      (await orm.Company.where({ workspaceId }).all()).map(toCompany),
    userName: async (id) => (await orm.User.where({ id }).first())?.name ?? null,
  };
}

export class Memory extends Context.Service<Memory, MemoryService>()("@crm/api/services/Memory") {
  static readonly layer = Layer.effect(
    Memory,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const db = yield* Database;

      const key = Option.filter(config.supermemoryApiKey, (value) => Redacted.value(value) !== "");

      const brandKey = Option.filter(
        config.contextDevApiKey,
        (value) => Redacted.value(value) !== "",
      );

      const prefix = yield* Option.match(config.memoryPrefix, {
        onSome: Effect.succeed,
        onNone: () => Effect.promise(() => memoryPrefix(config.authUrl.origin)),
      });

      yield* Effect.logInfo(
        `memory: ${Option.isSome(key) ? `supermemory (${prefix})` : "off"}, research: ${Option.isSome(brandKey) ? "context.dev" : "off"}`,
      );

      return makeMemory({
        store: Option.match(key, {
          onSome: (apiKey) => createSupermemoryStore({ apiKey: Redacted.value(apiKey) }),
          onNone: () => null,
        }),
        researcher: Option.match(brandKey, {
          onSome: (apiKey) => createContextDev({ apiKey: Redacted.value(apiKey) }),
          onNone: () => null,
        }),
        directory: prismaMemoryDirectory(db),
        prefix,
        now: () => new Date(),
        log: (message, cause) => {
          Effect.runFork(
            cause === undefined ? Effect.logInfo(message) : Effect.logWarning(message, cause),
          );
        },
      });
    }),
  ).pipe(Layer.provide(Database.layer));
}
