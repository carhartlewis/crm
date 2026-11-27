import {
  type ListRequest,
  Supermemory,
  SupermemoryError,
  type SupermemoryOptions,
  SupermemoryTimeoutError,
} from "supermemory";
import { z } from "zod";
import { type MemoryStore, MemoryStoreError } from "./store.ts";
import { MEMORY_SOURCE_KINDS, type MemoryFact } from "./types.ts";

/**
 * Supermemory v5 (https://supermemory.ai) as the memory store. Adapted from comp-neo's
 * `@trycompai/memory`. Server-only: the API key never leaves `apps/api`.
 */

interface RawFact {
  id: string;
  memory: string;
  version: number;
  isLatest: boolean;
  isInference: boolean;
  isStatic: boolean;
  isForgotten: boolean;
  system: { createdAt: string };
}

function toFact(raw: RawFact): MemoryFact {
  return {
    id: raw.id,
    text: raw.memory,
    version: raw.version,
    isLatest: raw.isLatest,
    isStatic: raw.isStatic,
    isInference: raw.isInference,
    createdAt: raw.system.createdAt,
  };
}

/** A document's `kind` metadata; anything else (older documents, typos) reads as no kind. */
const SourceKind = z.enum(MEMORY_SOURCE_KINDS).nullable().catch(null);

function toEntry(item: { id: string; memory: string }) {
  return { factId: item.id, text: item.memory };
}

export function toStoreError(error: Error): Error {
  if (error instanceof SupermemoryTimeoutError) {
    return new MemoryStoreError("unavailable", "Supermemory did not answer in time.");
  }

  if (!(error instanceof SupermemoryError)) return error;

  const status = error.statusCode ?? 0;

  if (status === 429) return new MemoryStoreError("rate_limited", "Supermemory limited the rate.");

  if (status === 402) return new MemoryStoreError("out_of_credits", "Supermemory has no credits.");

  if (status === 404) return new MemoryStoreError("not_found", "Supermemory has no such item.");

  if (status === 0 || status >= 500) {
    return new MemoryStoreError("unavailable", `Supermemory failed with status ${status}.`);
  }

  return new MemoryStoreError("rejected", `Supermemory refused the request (${status}).`);
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof Error ? toStoreError(error) : error;
  }
}

/** Runs `work`; a missing namespace or document is not an error. */
async function ignoreMissing<T>(work: () => Promise<T>) {
  try {
    await call(work);
  } catch (error) {
    if (!(error instanceof MemoryStoreError && error.kind === "not_found")) throw error;
  }
}

export function createSupermemoryStore(options: {
  apiKey: string;
  baseUrl?: string;
  timeoutInSeconds?: number;
}): MemoryStore {
  const clientOptions: SupermemoryOptions = {
    apiKey: options.apiKey,
    timeoutInSeconds: options.timeoutInSeconds ?? 20,
    maxRetries: 1,
  };

  if (options.baseUrl) clientOptions.baseUrl = options.baseUrl;

  const client = new Supermemory(clientOptions);

  return {
    name: "supermemory",

    describeNamespace: (namespace, supportingContext) =>
      ignoreMissing(() => client.namespaces.update(namespace, { supportingContext })),

    async putSource(namespace, source) {
      // Replacing deletes first, so a retry never appends the same text twice.
      await ignoreMissing(() => client.documents.delete(namespace, { ids: [source.sourceId] }));

      await call(() =>
        client.add(namespace, {
          id: source.sourceId,
          content: source.content,
          supportingContext: source.supportingContext,
          metadata: {
            kind: source.kind,
            sourceId: source.sourceId,
            workspaceId: source.workspaceId,
            title: source.title,
          },
          taskType: "memory",
          // A chat keeps growing, so its facts settle over time; anything else should show at once.
          dreaming: source.kind === "chat" ? "dynamic" : "instant",
        }),
      );
    },

    deleteSource: (namespace, sourceId) =>
      ignoreMissing(() => client.documents.delete(namespace, { ids: [sourceId] })),

    async listSources(namespace, limit) {
      try {
        const response = await call(() =>
          client.list(namespace, "documents", { limit, sort: "updatedAt", order: "desc" }),
        );

        return response.documents.map((document) => {
          const { status, dreamingStatus, updatedAt } = document.system;

          return {
            sourceId: document.id,
            kind: SourceKind.parse(document.metadata["kind"] ?? null),
            title: document.title ?? String(document.metadata["title"] ?? "Untitled"),
            status:
              status === "failed"
                ? "failed"
                : status === "done" && dreamingStatus === "done"
                  ? "done"
                  : "processing",
            updatedAt,
          };
        });
      } catch (error) {
        if (error instanceof MemoryStoreError && error.kind === "not_found") return [];

        throw error;
      }
    },

    async listFacts(namespace, page) {
      try {
        const query: ListRequest = { limit: page.limit, sort: "createdAt", order: "desc" };

        if (page.cursor) query.cursor = page.cursor;

        const response = await call(() => client.list(namespace, "memories", query));

        return {
          facts: response.memories.filter((fact) => !fact.isForgotten && fact.isLatest).map(toFact),
          nextCursor: response.pagination.hasMore ? (response.pagination.nextCursor ?? null) : null,
        };
      } catch (error) {
        if (error instanceof MemoryStoreError && error.kind === "not_found") {
          return { facts: [], nextCursor: null };
        }

        throw error;
      }
    },

    async search(namespace, request) {
      try {
        const response = await call(() =>
          client.search(namespace, {
            query: request.query,
            searchMode: "memories",
            rerank: "order",
            limit: request.limit,
            threshold: request.threshold ?? 0.4,
          }),
        );

        return response.results.flatMap((result) =>
          result.memory === undefined
            ? []
            : [
                {
                  factId: result.id,
                  text: result.memory,
                  similarity: result.similarity,
                  createdAt: result.system.createdAt ?? result.system.updatedAt,
                },
              ],
        );
      } catch (error) {
        if (error instanceof MemoryStoreError && error.kind === "not_found") return [];

        throw error;
      }
    },

    async profile(namespace) {
      try {
        const response = await call(() => client.profile(namespace, {}));

        return {
          static: response.profile.static.map(toEntry),
          dynamic: response.profile.dynamic.map(toEntry),
        };
      } catch (error) {
        if (error instanceof MemoryStoreError && error.kind === "not_found") {
          return { static: [], dynamic: [] };
        }

        throw error;
      }
    },

    async forgetFacts(namespace, factIds) {
      if (factIds.length === 0) return 0;

      const response = await call(() => client.memories.forget(namespace, { ids: [...factIds] }));

      return response.count;
    },

    deleteNamespace: (namespace) => ignoreMissing(() => client.namespaces.delete(namespace)),
  };
}
