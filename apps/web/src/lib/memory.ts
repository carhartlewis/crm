import type { Knowledge, MemoryGraph, MemoryHit, MemorySourceDetail } from "@crm/core/api";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { request, send } from "./api-fetch.ts";

/**
 * Workspace and record memory (ADR 0014). Not synced: Supermemory extracts facts in the
 * background, so a memory with a source still processing polls until it is done.
 */
export const memoryKeys = {
  all: ["memory"] as const,
  workspace: (userId: string, workspaceId: string) =>
    [...memoryKeys.all, userId, workspaceId] as const,
  target: (userId: string, workspaceId: string, target: MemoryTarget) => {
    const record = recordOf(target);

    return record
      ? ([...memoryKeys.workspace(userId, workspaceId), record.kind, record.id] as const)
      : memoryKeys.workspace(userId, workspaceId);
  },
};

/** The memory a call is about: the workspace's own, or one company's, contact's or deal's. */
export type MemoryTarget =
  | { readonly companyId?: undefined; readonly contactId?: undefined; readonly dealId?: undefined }
  | { readonly companyId: string }
  | { readonly contactId: string }
  | { readonly dealId: string };

/** Each record kind's knowledge path under `/api/memory`. */
const RECORD_PATHS = { company: "companies", contact: "contacts", deal: "deals" } as const;

function recordOf(target: MemoryTarget) {
  if ("companyId" in target && target.companyId) {
    return { kind: "company", param: "companyId", id: target.companyId } as const;
  }

  if ("contactId" in target && target.contactId) {
    return { kind: "contact", param: "contactId", id: target.contactId } as const;
  }

  if ("dealId" in target && target.dealId) {
    return { kind: "deal", param: "dealId", id: target.dealId } as const;
  }

  return null;
}

const targetQuery = (target: MemoryTarget) => {
  const record = recordOf(target);

  return record ? `${record.param}=${encodeURIComponent(record.id)}` : "";
};

const POLL_MS = 4_000;

const processing = (knowledge: Knowledge | undefined) =>
  knowledge?.sources.some((source) => source.status === "processing") ?? false;

/**
 * A new company's website research starts when it is created and lands a few seconds later, so
 * an empty memory polls until `expectUntil` (epoch ms) for its first source.
 */
export const knowledgeQuery = (
  userId: string,
  workspaceId: string,
  target: MemoryTarget = {},
  expectUntil = 0,
) =>
  queryOptions({
    queryKey: [...memoryKeys.target(userId, workspaceId, target), "knowledge"],
    queryFn: () => {
      const record = recordOf(target);

      return request<Knowledge>(
        record
          ? `/api/memory/${RECORD_PATHS[record.kind]}/${encodeURIComponent(record.id)}`
          : "/api/memory",
      );
    },
    refetchInterval: (query) => {
      const knowledge = query.state.data;
      const awaited = knowledge?.enabled === true && knowledge.sources.length === 0;

      return processing(knowledge) || (awaited && Date.now() < expectUntil) ? POLL_MS : false;
    },
  });

/** Sources and their facts, as the memory graph draws them. */
export const memoryGraphQuery = (userId: string, workspaceId: string, target: MemoryTarget = {}) =>
  queryOptions({
    queryKey: [...memoryKeys.target(userId, workspaceId, target), "graph"],
    queryFn: () => request<MemoryGraph>(`/api/memory/graph?${targetQuery(target)}`),
  });

/** Facts that match a search, to highlight their sources in the graph. */
export const memorySearchQuery = (
  userId: string,
  workspaceId: string,
  target: MemoryTarget,
  query: string,
) =>
  queryOptions({
    queryKey: [...memoryKeys.target(userId, workspaceId, target), "search", query],
    queryFn: () =>
      request<readonly MemoryHit[]>(
        `/api/memory/search?q=${encodeURIComponent(query)}&${targetQuery(target)}`,
      ),
    staleTime: 30_000,
  });

/** One source with its text, for its record sheet. */
export const memorySourceQuery = (
  userId: string,
  workspaceId: string,
  target: MemoryTarget,
  id: string,
) =>
  queryOptions({
    queryKey: [...memoryKeys.target(userId, workspaceId, target), "source", id],
    queryFn: () =>
      request<MemorySourceDetail>(
        `/api/memory/sources/${encodeURIComponent(id)}?${targetQuery(target)}`,
      ),
  });

const refresh = (client: QueryClient) => client.invalidateQueries({ queryKey: memoryKeys.all });

/** The body of a memory write: its target, plus a note's text or a fact's id. */
type MemoryWrite = MemoryTarget & { readonly text?: string; readonly factId?: string };

const post = (path: string, body: MemoryWrite) =>
  send(path, { method: "POST", body: JSON.stringify(body) }).then(() => undefined);

export const addNoteMutation = mutationOptions({
  mutationKey: [...memoryKeys.all, "note"],
  mutationFn: (note: MemoryTarget & { text: string }) => post("/api/memory/notes", note),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const researchMutation = mutationOptions({
  mutationKey: [...memoryKeys.all, "research"],
  mutationFn: (target: MemoryTarget) => post("/api/memory/research", target),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const forgetMutation = mutationOptions({
  mutationKey: [...memoryKeys.all, "forget"],
  mutationFn: (fact: MemoryTarget & { factId: string }) => post("/api/memory/forget", fact),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const deleteSourceMutation = mutationOptions({
  mutationKey: [...memoryKeys.all, "delete-source"],
  mutationFn: async (source: MemoryTarget & { id: string }) => {
    await send(`/api/memory/sources/${encodeURIComponent(source.id)}?${targetQuery(source)}`, {
      method: "DELETE",
    });
  },
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

/**
 * Asks the API to refresh the workspace's stale fact copies (ADR 0017). It answers at once; new
 * facts arrive through sync. ⌘K sends it when it opens.
 */
export const refreshMemoryFactsMutation = mutationOptions({
  mutationKey: [...memoryKeys.all, "refresh-facts"],
  mutationFn: () => send("/api/memory/refresh", { method: "POST" }).then(() => undefined),
});
