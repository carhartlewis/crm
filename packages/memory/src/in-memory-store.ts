import type { MemoryStore } from "./store.ts";
import type { MemoryFact, MemorySource } from "./types.ts";

interface Partition {
  supportingContext: string;
  sources: Map<string, { source: MemorySource; updatedAt: string }>;
  facts: Map<string, MemoryFact & { sourceId: string; forgotten: boolean }>;
}

function entry(fact: MemoryFact) {
  return { factId: fact.id, text: fact.text };
}

/**
 * A synchronous fake for tests: each source's non-empty lines become its facts at once, and
 * search matches words. Never use it outside tests.
 */
export function createInMemoryStore(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const partitions = new Map<string, Partition>();
  let nextFact = 1;

  const partition = (namespace: string) => {
    const existing = partitions.get(namespace);

    if (existing) return existing;

    const created: Partition = { supportingContext: "", sources: new Map(), facts: new Map() };

    partitions.set(namespace, created);

    return created;
  };

  const live = (namespace: string) =>
    [...partition(namespace).facts.values()].filter((fact) => !fact.forgotten);

  const store: MemoryStore & {
    readonly namespaces: () => readonly string[];
    readonly sources: (namespace: string) => readonly MemorySource[];
    readonly context: (namespace: string) => string;
  } = {
    name: "memory",
    namespaces: () => [...partitions.keys()],
    sources: (namespace) => [...partition(namespace).sources.values()].map(({ source }) => source),
    context: (namespace) => partition(namespace).supportingContext,

    async describeNamespace(namespace, supportingContext) {
      partition(namespace).supportingContext = supportingContext;
    },

    async putSource(namespace, source) {
      const part = partition(namespace);
      const createdAt = now().toISOString();

      for (const [id, fact] of part.facts)
        if (fact.sourceId === source.sourceId) part.facts.delete(id);

      part.sources.set(source.sourceId, { source, updatedAt: createdAt });

      for (const line of source.content.split("\n")) {
        const text = line.replace(/^[-*#\s]+/, "").trim();

        if (!text) continue;

        const id = `fact-${nextFact++}`;

        part.facts.set(id, {
          id,
          text,
          version: 1,
          isLatest: true,
          isStatic: source.kind === "website_research",
          isInference: false,
          createdAt,
          sourceId: source.sourceId,
          forgotten: false,
        });
      }
    },

    async deleteSource(namespace, sourceId) {
      const part = partition(namespace);

      part.sources.delete(sourceId);

      for (const [id, fact] of part.facts) if (fact.sourceId === sourceId) part.facts.delete(id);
    },

    async listSources(namespace, limit) {
      return [...partition(namespace).sources.values()]
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map(({ source, updatedAt }) => ({
          sourceId: source.sourceId,
          kind: source.kind,
          title: source.title,
          status: "done" as const,
          updatedAt,
        }));
    },

    async listFacts(namespace, page) {
      const facts = live(namespace).toReversed();
      const start = page.cursor ? Number(page.cursor) : 0;
      const slice = facts.slice(start, start + page.limit);

      return {
        facts: slice,
        nextCursor: start + page.limit < facts.length ? String(start + page.limit) : null,
      };
    },

    async search(namespace, request) {
      const words = request.query
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 2);

      return live(namespace)
        .map((fact) => {
          const text = fact.text.toLowerCase();
          const matched = words.filter((word) => text.includes(word)).length;

          return { fact, similarity: words.length === 0 ? 0 : matched / words.length };
        })
        .filter(({ similarity }) => similarity >= (request.threshold ?? 0.4))
        .toSorted((a, b) => b.similarity - a.similarity)
        .slice(0, request.limit)
        .map(({ fact, similarity }) => ({
          factId: fact.id,
          text: fact.text,
          similarity,
          createdAt: fact.createdAt,
          sourceId: fact.sourceId,
        }));
    },

    async profile(namespace) {
      const facts = live(namespace);

      return {
        static: facts.filter((fact) => fact.isStatic).map(entry),
        dynamic: facts.filter((fact) => !fact.isStatic).map(entry),
      };
    },

    async forgetFacts(namespace, factIds) {
      let count = 0;

      for (const id of factIds) {
        const fact = partition(namespace).facts.get(id);

        if (fact && !fact.forgotten) {
          fact.forgotten = true;
          count += 1;
        }
      }

      return count;
    },

    async graph(namespace, limit) {
      const part = partition(namespace);

      return [...part.sources.values()].slice(0, limit).map(({ source, updatedAt }) => ({
        sourceId: source.sourceId,
        kind: source.kind,
        title: source.title,
        summary: null,
        createdAt: updatedAt,
        updatedAt,
        facts: [...part.facts.values()].flatMap((fact) =>
          fact.sourceId === source.sourceId
            ? [Object.assign({}, fact, { isForgotten: fact.forgotten, updatedAt: fact.createdAt })]
            : [],
        ),
      }));
    },

    async deleteNamespace(namespace) {
      partitions.delete(namespace);
    },
  };

  return store;
}
