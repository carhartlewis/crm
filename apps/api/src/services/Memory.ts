import {
  Invalid,
  type Knowledge,
  type MemoryGraph,
  type MemorySourceDetail,
  type MemoryHit,
  MEMORY_CORE_ID,
  NoActiveWorkspace,
  NotFound,
  UpstreamUnavailable,
} from "@crm/core/api";
import { isCompanyId } from "@crm/core/company";
import { isContactId, isDealId } from "@crm/core/records";
import { MAX_NOTE_CHARACTERS, memoryNoteError } from "@crm/core/memory";
import type { CompanyResearcher } from "@crm/core/brand";
import type { Db } from "@crm/core/db";
import type { Kv as KvStore } from "@crm/core/kv";
import {
  EMPTY_PROFILE,
  type GraphSource,
  type MemoryFact,
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
import { Brand } from "./Brand.ts";
import { Database } from "./Database.ts";
import { Kv } from "./Kv.ts";
import { type FactMirror, prismaFactMirror } from "./memory-mirror.ts";

/**
 * Workspace and record memory (ADR 0014): the workspace's own, and each company's, contact's
 * and deal's. Supermemory stores the sources and extracts the facts; this service checks
 * membership, picks the namespace, and writes the sources: website research when a workspace or
 * company is created, members' notes, and what the agent sends.
 * Deciding what a chat adds (Jev) is the agent's job, not the API's.
 */

export interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
}

export interface ContactRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly companyName: string | null;
}

export interface DealRow {
  readonly id: string;
  readonly name: string;
  readonly companyName: string | null;
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
  contact(workspaceId: string, id: string): Promise<ContactRow | null>;
  deal(workspaceId: string, id: string): Promise<DealRow | null>;
  userName(id: string): Promise<string | null>;
}

export interface MemoryDependencies {
  /** Null turns memory off: reads are empty and writes fail with a clear message. */
  readonly store: MemoryStore | null;
  readonly researcher: CompanyResearcher | null;
  readonly directory: MemoryDirectory;
  /** The local copy of facts that ⌘K searches (ADR 0017). */
  readonly mirror: FactMirror;
  /** Marks which memories' copies are fresh, with a TTL. */
  readonly kv: KvStore;
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

/** The record a memory call is about; with none, the workspace's own memory. At most one. */
type Target = {
  readonly companyId?: string | undefined;
  readonly contactId?: string | undefined;
  readonly dealId?: string | undefined;
};

type MemoryError = NoActiveWorkspace | NotFound | Invalid | UpstreamUnavailable;

export interface MemoryService {
  /** The workspace's own memory, or the record's the target names. */
  readonly knowledge: (actor: Actor, input: Target) => Effect.Effect<Knowledge, MemoryError>;
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
  /**
   * Starts refreshing the copied facts of the workspace's stale memories (its own first, then
   * its companies'), a few per call, off the request path. ⌘K calls it when it opens.
   */
  readonly refresh: (actor: Actor) => Effect.Effect<void, MemoryError>;

  /** Background work after a write elsewhere. Never throws; failures are logged. */
  readonly researchWorkspace: (workspaceId: string) => Promise<void>;
  readonly researchCompany: (workspaceId: string, companyId: string) => Promise<void>;
  readonly companyRemoved: (workspaceId: string, companyId: string) => Promise<void>;

  readonly agent: {
    /** Saved knowledge for a record read, without a relevance filter. */
    readonly knowledge: (caller: AgentCaller, input: Target) => Promise<AgentResult<Knowledge>>;
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
    /**
     * Saves what the agent's research found about a contact or deal as the record's research
     * source, replacing the earlier one. It becomes the core of the record's graph (ADR 0029).
     */
    readonly research: (
      caller: AgentCaller,
      input: Target & { content: string },
    ) => Promise<AgentResult<null>>;
  };
}

/**
 * The record's research source: website research for the workspace and companies, the agent's
 * research for contacts and deals. One per memory; the graph draws it as the core (ADR 0026).
 */
const RESEARCH_SOURCE = "website-research";

/** Research holds a profile or a deal brief, so it may be longer than a note. */
const MAX_RESEARCH_CHARACTERS = 12_000;

const FACT_LIMIT = 100;
const SOURCE_LIMIT = 20;
const RECALL_COMPANIES = 3;
const GRAPH_SOURCES = 60;

/** Most facts copied per memory; a page is FACT_LIMIT facts. */
const MIRROR_LIMIT = 500;

/** A copy refreshed this recently is left alone, unless a write marked it stale. */
const FRESH_SECONDS = 15 * 60;

/** Memories one `refresh` call copies, and how many at once. */
const REFRESH_BATCH = 8;
const REFRESH_CONCURRENCY = 2;

const freshKey = (ns: string) => `memory:fresh:${ns}`;

/** Every fact of a memory, newest first, up to MIRROR_LIMIT: one page after another. */
async function allFacts(
  memory: MemoryStore,
  ns: string,
  cursor: string | null = null,
  found: readonly MemoryFact[] = [],
): Promise<readonly MemoryFact[]> {
  const page = await memory.listFacts(ns, { cursor, limit: FACT_LIMIT });
  const facts = [...found, ...page.facts];

  return page.nextCursor !== null && facts.length < MIRROR_LIMIT
    ? allFacts(memory, ns, page.nextCursor, facts)
    : facts.slice(0, MIRROR_LIMIT);
}

/** Runs `work` on each item, `size` at a time, one batch after another. */
async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>) {
  if (items.length === 0) return;

  await Promise.all(items.slice(0, size).map(work));
  await inBatches(items.slice(size), size, work);
}

type GraphDocument = MemoryGraph["documents"][number];

type GraphMemory = GraphDocument["memories"][number];

type GraphRelation = NonNullable<GraphMemory["relation"]>;

/** Who a memory is about: the core of its graph. */
export interface GraphCore {
  readonly kind: MemorySubject["type"];
  readonly title: string;
}

/** The fact that carries a source's link to the core: its first current fact. */
function anchorOf(memories: readonly GraphMemory[]) {
  return memories.find((memory) => memory.isLatest && !memory.isForgotten) ?? memories[0];
}

function withRelations(
  document: GraphDocument,
  memoryId: string,
  relations: Readonly<Record<string, GraphRelation>>,
): GraphDocument {
  return {
    ...document,
    memories: document.memories.map((memory) =>
      memory.id === memoryId
        ? { ...memory, memoryRelations: { ...memory.memoryRelations, ...relations } }
        : memory,
    ),
  };
}

/**
 * Links every other source to the core, as comp-neo does. The graph draws edges only from facts, so
 * a source's anchor fact carries its link. A source with no facts yet (a note still being read)
 * hangs off the core's anchor fact instead, or the first linked fact when the core has none.
 */
function linkToCore(core: GraphDocument, others: readonly GraphDocument[]): GraphDocument[] {
  const linked = others.map((document) => {
    const anchor = anchorOf(document.memories);

    return anchor ? withRelations(document, anchor.id, { [core.id]: "derives" }) : document;
  });

  const empty = linked.flatMap((document) => (document.memories.length === 0 ? [document.id] : []));
  const documents = [core, ...linked];
  const carrier = documents.find((document) => document.memories.length > 0);
  const anchor = carrier && anchorOf(carrier.memories);

  if (!carrier || !anchor || empty.length === 0) return documents;

  const links = Object.fromEntries(empty.map((id) => [id, "extends" as const]));

  return documents.map((document) =>
    document.id === carrier.id ? withRelations(document, anchor.id, links) : document,
  );
}

/** Sources and facts in the shape `@supermemory/memory-graph` draws, around their core. */
export function toMemoryGraph(
  spaceId: string,
  sources: readonly GraphSource[],
  subject: GraphCore,
): MemoryGraph {
  const documents: GraphDocument[] = sources.map((source) => ({
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
  }));

  const totals = {
    sources: sources.length,
    facts: sources.reduce(
      (total, source) =>
        total + source.facts.filter((fact) => fact.isLatest && !fact.isForgotten).length,
      0,
    ),
  };

  // An empty memory stays empty, so the page shows its empty state.
  if (documents.length === 0) return { documents, totals };

  // Research is the core even while its facts are being extracted. Contacts and deals may
  // only have notes or remembered facts: use their oldest source until research arrives.
  const research = documents.find((document) => document.id === RESEARCH_SOURCE);

  const coreSource =
    research ??
    (subject.kind === "contact" || subject.kind === "deal"
      ? documents.toSorted(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )[0]
      : undefined);

  if (coreSource) {
    const core = { ...coreSource, title: subject.title, documentType: subject.kind };

    return {
      documents: linkToCore(
        core,
        documents.filter((document) => document !== coreSource),
      ),
      totals,
    };
  }

  // Before research lands (or with no website), the core is drawn: it has no facts and never opens.
  const since = documents.map((document) => document.createdAt).toSorted()[0] ?? "";

  return {
    documents: linkToCore(
      {
        id: MEMORY_CORE_ID,
        title: subject.title,
        summary: null,
        documentType: subject.kind,
        createdAt: since,
        updatedAt: since,
        memories: [],
      },
      documents,
    ),
    totals,
  };
}

const noWorkspace = () =>
  new NoActiveWorkspace({ message: "Choose a workspace you belong to first" });

const NOT_FOUND = {
  company: "Company not found",
  contact: "Contact not found",
  deal: "Deal not found",
} as const;

const recordNotFound = (subject: MemorySubject) =>
  new NotFound({ message: subject.type === "workspace" ? "Not found" : NOT_FOUND[subject.type] });

const oneRecord = () => new Invalid({ message: "A memory is about one record at a time." });

const unavailable = () =>
  new UpstreamUnavailable({ message: "Memory is unavailable right now. Try again." });

const memoryOff = () =>
  new UpstreamUnavailable({ message: "Memory isn't set up on this server (SUPERMEMORY_API_KEY)." });

/** The subject a target names, or null when it names more than one record. */
export function subjectOf(target: Target): MemorySubject | null {
  const named = [target.companyId, target.contactId, target.dealId].filter(Boolean).length;

  if (named > 1) return null;

  if (target.companyId) return { type: "company", companyId: target.companyId };

  if (target.contactId) return { type: "contact", contactId: target.contactId };

  if (target.dealId) return { type: "deal", dealId: target.dealId };

  return { type: "workspace" };
}

/** Whether an id has the right shape for its subject, before any database read. */
function wellFormed(subject: MemorySubject) {
  switch (subject.type) {
    case "workspace":
      return true;
    case "company":
      return isCompanyId(subject.companyId);
    case "contact":
      return isContactId(subject.contactId);
    case "deal":
      return isDealId(subject.dealId);
  }
}

/**
 * The company whose copy (`memory_fact`, ADR 0017) holds a subject's facts: null for the
 * workspace's own. Contact and deal memories are not copied, so ⌘K doesn't list their facts.
 */
function mirrorOf(subject: MemorySubject): { readonly companyId: string | null } | null {
  if (subject.type === "workspace") return { companyId: null };

  return subject.type === "company" ? { companyId: subject.companyId } : null;
}

// Supermemory keeps only what the context calls worth remembering. Naming public facts matters:
// with only relationship facts in the brief, website research about a company yields few or none.
function workspaceContext(workspace: WorkspaceRow) {
  return `Memory of ${workspace.name} (${workspace.website}), the company that uses this CRM. Remember every concrete fact about ${workspace.name} as its own memory: what it does and sells, its industry, locations, people and their roles, customers, products, pricing, tools and ways of working. Public facts from its website are worth remembering.`;
}

function companyContext(workspace: WorkspaceRow | null, company: CompanyRow) {
  const owner = workspace?.name ?? "the workspace";
  const site = company.domain ? ` (${company.domain})` : "";

  return `Memory of ${company.name}${site}, a customer, prospect or partner that ${owner} tracks in its CRM. Remember every concrete fact about ${company.name} as its own memory: what it does and sells, its industry, locations and offices, people and their roles, customers, portfolio or partners, products, size and contact details, and its needs, deals, tools, decisions and history with ${owner}. Public facts from its website are worth remembering.`;
}

function contactContext(workspace: WorkspaceRow | null, contact: ContactRow) {
  const owner = workspace?.name ?? "the workspace";
  const role = [contact.title, contact.companyName].filter(Boolean).join(" at ");
  const about = role ? ` (${role})` : "";

  return `Memory of ${contact.name}${about}, a person that ${owner} tracks in its CRM. Remember every concrete fact about ${contact.name} as its own memory: their role, team and responsibilities, background, location, how they like to be contacted, what they care about, their needs, objections and decisions, and their history with ${owner}.`;
}

function dealContext(workspace: WorkspaceRow | null, deal: DealRow) {
  const owner = workspace?.name ?? "the workspace";
  const company = deal.companyName ? ` with ${deal.companyName}` : "";

  return `Memory of the deal "${deal.name}"${company}, which ${owner} tracks in its CRM. Remember every concrete fact about this deal as its own memory: what is being bought and why, scope, pricing and budget, timeline, decision makers and process, competitors, risks, objections, next steps and agreements.`;
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
  const refreshing = new Set<string>();

  const namespace = (workspaceId: string, subject: MemorySubject) =>
    memoryNamespace(deps.prefix, workspaceId, subject);

  const namespaceOf = (workspaceId: string, companyId: string | null) =>
    namespace(workspaceId, companyId ? { type: "company", companyId } : { type: "workspace" });

  /** After a write: the copy is out of date, so the next look refreshes it. */
  const markStale = async (ns: string) => {
    try {
      await deps.kv.delete(freshKey(ns));
    } catch (cause) {
      deps.log("memory: marking a copy stale failed", cause);
    }
  };

  /** Writes a source, then marks its memory's copy stale. */
  const write = async (memory: MemoryStore, ns: string, source: MemorySource) => {
    await put(memory, ns, source);
    await markStale(ns);
  };

  /**
   * Copies a memory's facts from the store. While a source is still being read, the copy stays
   * stale, so the next look copies the facts that arrive. Never throws.
   */
  const refreshCopy = async (workspaceId: string, companyId: string | null) => {
    if (!store) return;

    const ns = namespaceOf(workspaceId, companyId);

    if (refreshing.has(ns)) return;

    refreshing.add(ns);

    try {
      const [sources, facts] = await Promise.all([
        store.listSources(ns, SOURCE_LIMIT),
        allFacts(store, ns),
      ]);

      await deps.mirror.replace(
        workspaceId,
        companyId,
        facts.map((fact) => ({
          id: fact.id,
          text: fact.text,
          isStatic: fact.isStatic,
          createdAt: fact.createdAt,
        })),
        deps.now(),
      );

      if (!sources.some((source) => source.status === "processing")) {
        await deps.kv.set(freshKey(ns), "1", FRESH_SECONDS);
      }
    } catch (cause) {
      deps.log("memory: copying facts failed", cause);
    } finally {
      refreshing.delete(ns);
    }
  };

  const isFresh = async (workspaceId: string, companyId: string | null) => {
    try {
      return (await deps.kv.get(freshKey(namespaceOf(workspaceId, companyId)))) !== null;
    } catch {
      return false;
    }
  };

  const refreshIfStale = async (workspaceId: string, companyId: string | null) => {
    if (store && !(await isFresh(workspaceId, companyId))) {
      await refreshCopy(workspaceId, companyId);
    }
  };

  /** Refreshes up to REFRESH_BATCH stale copies: the workspace's own, then its companies'. */
  const refreshWorkspace = async (workspaceId: string) => {
    try {
      const companies = await directory.companies(workspaceId);
      const memories = [null, ...companies.map((company) => company.id)];
      const fresh = await Promise.all(memories.map((companyId) => isFresh(workspaceId, companyId)));
      const stale = memories.filter((_, index) => !fresh[index]).slice(0, REFRESH_BATCH);

      await inBatches(stale, REFRESH_CONCURRENCY, (companyId) =>
        refreshCopy(workspaceId, companyId),
      );
    } catch (cause) {
      deps.log("memory: refreshing the workspace's copies failed", cause);
    }
  };

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

  /**
   * Who a subject is: its name for the graph's core, and the brief the store reads its sources
   * with. Null when the record isn't in the workspace.
   */
  const describe = async (
    workspaceId: string,
    subject: MemorySubject,
  ): Promise<{ readonly title: string; readonly context: string } | null> => {
    const workspace = await directory.workspace(workspaceId);

    switch (subject.type) {
      case "workspace":
        return workspace
          ? { title: workspace.name, context: workspaceContext(workspace) }
          : { title: "Workspace", context: "" };
      case "company": {
        const company = await directory.company(workspaceId, subject.companyId);

        return company && { title: company.name, context: companyContext(workspace, company) };
      }

      case "contact": {
        const contact = await directory.contact(workspaceId, subject.contactId);

        return contact && { title: contact.name, context: contactContext(workspace, contact) };
      }

      case "deal": {
        const deal = await directory.deal(workspaceId, subject.dealId);

        return deal && { title: deal.name, context: dealContext(workspace, deal) };
      }
    }
  };

  /** Checks the record a target names is in the workspace; its namespace and subject. */
  const target = (workspaceId: string, input: Target) =>
    Effect.gen(function* () {
      const subject = subjectOf(input);

      if (!subject) return yield* Effect.fail(oneRecord());

      const ns = { ns: namespace(workspaceId, subject), subject };

      if (subject.type === "workspace") return ns;

      if (!wellFormed(subject)) return yield* Effect.fail(recordNotFound(subject));

      const found = yield* Effect.promise(() => describe(workspaceId, subject));

      return found ? ns : yield* Effect.fail(recordNotFound(subject));
    });

  /** Refreshes a subject's copy when it has one and it is stale. */
  const followCopy = (workspaceId: string, subject: MemorySubject) => {
    const mirror = mirrorOf(subject);

    if (mirror) void refreshIfStale(workspaceId, mirror.companyId);
  };

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

      await write(store, ns, {
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

  const writeNote = async (
    memory: MemoryStore,
    workspaceId: string,
    subject: MemorySubject,
    input: { text: string; kind: MemorySource["kind"]; title: string },
  ) => {
    const ns = namespace(workspaceId, subject);

    await write(memory, ns, {
      sourceId: `${input.kind === "member_note" ? "note" : input.kind}-${crypto.randomUUID()}`,
      workspaceId,
      kind: input.kind,
      title: input.title,
      content: input.text,
      supportingContext: (await describe(workspaceId, subject))?.context ?? "",
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

  /** The subject an agent call names, when it is one record (or none) in the workspace. */
  const agentTarget = async (caller: AgentCaller, input: Target) => {
    const subject = subjectOf(input);

    if (!subject || !wellFormed(subject)) return null;

    if (subject.type === "workspace") return subject;

    return (await describe(caller.workspaceId, subject)) ? subject : null;
  };

  const noRecord = {
    ok: false,
    status: 404,
    message: "No such record in this workspace.",
  } as const;

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
    knowledge: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const { ns, subject } = yield* target(workspaceId, input);

        followCopy(workspaceId, subject);

        return yield* knowledge(ns);
      }),

    graph: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const { ns, subject } = yield* target(workspaceId, input);

        if (!store) return { documents: [], totals: { sources: 0, facts: 0 } };

        // The page polls this while a source is read, so the copy follows along.
        followCopy(workspaceId, subject);

        const [sources, about] = yield* Effect.all(
          [
            stored("graph", (memory) => memory.graph(ns, GRAPH_SOURCES)),
            Effect.promise(() => describe(workspaceId, subject)),
          ],
          { concurrency: 2 },
        );

        return toMemoryGraph(ns, sources, { kind: subject.type, title: about?.title ?? "" });
      }),

    source: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const { ns } = yield* target(workspaceId, input);
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
        const { ns, subject } = yield* target(workspaceId, input);

        yield* stored("delete source", (memory) => memory.deleteSource(ns, input.id));
        yield* Effect.promise(() => markStale(ns));

        const mirror = mirrorOf(subject);

        if (mirror) void refreshCopy(workspaceId, mirror.companyId);
      }),

    search: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const { ns } = yield* target(workspaceId, input);
        const query = input.q.trim().slice(0, 500);

        if (!query || !store) return [];

        const hits = yield* stored("search", (memory) =>
          memory.search(ns, { query, limit: 12, threshold: 0.3 }),
        );

        return hits.map((hit) => ({ id: hit.factId, text: hit.text, sourceId: hit.sourceId }));
      }),

    addNote: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const text = input.text.trim();

        const problem = memoryNoteError(text);

        if (problem) return yield* Effect.fail(new Invalid({ message: problem }));

        const { subject } = yield* target(workspaceId, input);

        const author = yield* Effect.promise(() => directory.userName(actor.userId));

        yield* stored("note", (memory) =>
          writeNote(memory, workspaceId, subject, {
            text,
            kind: "member_note",
            title: `Note from ${author ?? "a member"}`,
          }),
        );
      }),

    research: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);

        const { subject } = yield* target(workspaceId, input);

        // Only a workspace or a company has a website to read.
        if (subject.type === "contact" || subject.type === "deal") {
          return yield* Effect.fail(
            new Invalid({ message: "Only companies have a website to read." }),
          );
        }

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
        void (subject.type === "company"
          ? researchCompany(workspaceId, subject.companyId)
          : researchWorkspace(workspaceId));
      }),

    forget: (actor, input) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);
        const { ns } = yield* target(workspaceId, input);

        yield* stored("forget", (memory) => memory.forgetFacts(ns, [input.factId]));
        yield* Effect.promise(() => deps.mirror.remove(workspaceId, [input.factId]));
      }),

    refresh: (actor) =>
      Effect.gen(function* () {
        const workspaceId = yield* member(actor);

        if (!store) return;

        void refreshWorkspace(workspaceId);
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
      knowledge: (caller, input) =>
        agentCall(caller, async () => {
          const subject = await agentTarget(caller, input);

          if (!subject) return noRecord;

          return {
            ok: true,
            value: await Effect.runPromise(knowledge(namespace(caller.workspaceId, subject))),
          };
        }),

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
          const subject = await agentTarget(caller, input);

          if (!subject) return noRecord;

          const hits = await memory.search(namespace(caller.workspaceId, subject), {
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

          const subject = await agentTarget(caller, input);

          if (!subject) return noRecord;

          const ns = namespace(caller.workspaceId, subject);

          if (input.replaces) {
            await memory.forgetFacts(ns, [input.replaces]);
            await deps.mirror.remove(caller.workspaceId, [input.replaces]);
          }

          await writeNote(memory, caller.workspaceId, subject, {
            kind: input.kind,
            text,
            title: input.kind === "email" ? "Sent email" : "Remembered by the agent",
          });

          return { ok: true, value: null };
        }),

      forget: (caller, input) =>
        agentCall(caller, async (memory) => {
          const subject = await agentTarget(caller, input);

          if (!subject) return noRecord;

          await memory.forgetFacts(namespace(caller.workspaceId, subject), [input.factId]);
          await deps.mirror.remove(caller.workspaceId, [input.factId]);

          return { ok: true, value: null };
        }),

      research: (caller, input) =>
        agentCall(caller, async (memory) => {
          const content = input.content.trim();

          if (!content || content.length > MAX_RESEARCH_CHARACTERS) {
            return { ok: false, status: 400, message: "Research must be 1 to 12,000 characters." };
          }

          const subject = await agentTarget(caller, input);

          if (!subject) return noRecord;

          // Companies and the workspace keep their website research (ADR 0014).
          if (subject.type !== "contact" && subject.type !== "deal") {
            return { ok: false, status: 400, message: "Save research on a contact or a deal." };
          }

          const about = await describe(caller.workspaceId, subject);

          await write(memory, namespace(caller.workspaceId, subject), {
            sourceId: RESEARCH_SOURCE,
            workspaceId: caller.workspaceId,
            kind: "research",
            title: `Research: ${about?.title ?? "record"}`,
            content,
            supportingContext: about?.context ?? "",
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
    contact: async (workspaceId, id) => {
      const row = await orm.Contact.where({ workspaceId, id }).first();

      if (!row) return null;

      const company = row.companyId
        ? await orm.Company.where({ workspaceId, id: row.companyId }).first()
        : null;

      return {
        id: row.id,
        name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        title: row.title,
        companyName: company?.name ?? null,
      };
    },
    deal: async (workspaceId, id) => {
      const row = await orm.Deal.where({ workspaceId, id }).first();

      if (!row) return null;

      const company = await orm.Company.where({ workspaceId, id: row.companyId }).first();

      return { id: row.id, name: row.name, companyName: company?.name ?? null };
    },
    userName: async (id) => (await orm.User.where({ id }).first())?.name ?? null,
  };
}

export class Memory extends Context.Service<Memory, MemoryService>()("@crm/api/services/Memory") {
  static readonly layer = Layer.effect(
    Memory,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const db = yield* Database;
      const kv = yield* Kv;

      const key = Option.filter(config.supermemoryApiKey, (value) => Redacted.value(value) !== "");

      const researcher = yield* Brand;

      const prefix = yield* Option.match(config.memoryPrefix, {
        onSome: Effect.succeed,
        onNone: () => Effect.promise(() => memoryPrefix(config.authUrl.origin)),
      });

      yield* Effect.logInfo(
        `memory: ${Option.isSome(key) ? `supermemory (${prefix})` : "off"}, research: ${researcher ? "context.dev" : "off"}`,
      );

      return makeMemory({
        store: Option.match(key, {
          onSome: (apiKey) => createSupermemoryStore({ apiKey: Redacted.value(apiKey) }),
          onNone: () => null,
        }),
        researcher,
        directory: prismaMemoryDirectory(db),
        mirror: prismaFactMirror(db),
        kv,
        prefix,
        now: () => new Date(),
        log: (message, cause) => {
          Effect.runFork(
            cause === undefined ? Effect.logInfo(message) : Effect.logWarning(message, cause),
          );
        },
      });
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer, Brand.layer]));
}
