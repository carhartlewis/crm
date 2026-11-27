import type { Knowledge, MemoryGraph, MemoryHit, MemorySourceDetail } from "@crm/core/api";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { request, send } from "./api-fetch.ts";

/**
 * Workspace and company memory (ADR 0014). Not synced: Supermemory extracts facts in the
 * background, so a memory with a source still processing polls until it is done.
 */
export const memoryKeys = {
  all: ["memory"] as const,
  workspace: (userId: string, workspaceId: string) =>
    [...memoryKeys.all, userId, workspaceId] as const,
  company: (userId: string, workspaceId: string, companyId: string) =>
    [...memoryKeys.workspace(userId, workspaceId), "company", companyId] as const,
  target: (userId: string, workspaceId: string, target: MemoryTarget) =>
    target.companyId
      ? memoryKeys.company(userId, workspaceId, target.companyId)
      : memoryKeys.workspace(userId, workspaceId),
};

const targetQuery = (target: MemoryTarget) =>
  target.companyId ? `companyId=${encodeURIComponent(target.companyId)}` : "";

/** The memory a call is about: the workspace's own, or one company's. */
export interface MemoryTarget {
  readonly companyId?: string;
}

const POLL_MS = 4_000;

const processing = (knowledge: Knowledge | undefined) =>
  knowledge?.sources.some((source) => source.status === "processing") ?? false;

export const knowledgeQuery = (userId: string, workspaceId: string, target: MemoryTarget = {}) =>
  queryOptions({
    queryKey: [...memoryKeys.target(userId, workspaceId, target), "knowledge"],
    queryFn: () =>
      request<Knowledge>(
        target.companyId
          ? `/api/memory/companies/${encodeURIComponent(target.companyId)}`
          : "/api/memory",
      ),
    refetchInterval: (query) => (processing(query.state.data) ? POLL_MS : false),
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
