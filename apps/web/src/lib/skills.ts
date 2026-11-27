import type { SkillDetail, SkillsShResult, SkillSummary } from "@crm/core/api";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { request, send } from "./api-fetch.ts";

/** Skills belong to a workspace; the user is in the key so one account's cache never serves another. */
export const skillKeys = {
  all: ["skills"] as const,
  list: (userId: string, workspaceId: string) => [...skillKeys.all, userId, workspaceId] as const,
  detail: (userId: string, workspaceId: string, id: string) =>
    [...skillKeys.list(userId, workspaceId), id] as const,
  discover: (userId: string, workspaceId: string, query: string) =>
    [...skillKeys.list(userId, workspaceId), "discover", query] as const,
};

export const skillsQuery = (userId: string, workspaceId: string) =>
  queryOptions({
    queryKey: skillKeys.list(userId, workspaceId),
    queryFn: () => request<readonly SkillSummary[]>("/api/skills"),
  });

export const skillQuery = (userId: string, workspaceId: string, id: string) =>
  queryOptions({
    queryKey: skillKeys.detail(userId, workspaceId, id),
    queryFn: () => request<SkillDetail>(`/api/skills/${encodeURIComponent(id)}`),
  });

/** skills.sh search. Results change slowly, so they stay fresh for a minute. */
export const discoverQuery = (userId: string, workspaceId: string, query: string) =>
  queryOptions({
    queryKey: skillKeys.discover(userId, workspaceId, query),
    queryFn: () =>
      request<readonly SkillsShResult[]>(`/api/skills/discover?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });

const refresh = (client: QueryClient) => client.invalidateQueries({ queryKey: skillKeys.all });

export const installSkillMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "install"],
  mutationFn: (sourceId: string) =>
    request<SkillSummary>("/api/skills/install", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    }),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const setSkillEnabledMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "enabled"],
  mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
    request<SkillSummary>(`/api/skills/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const removeSkillMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "remove"],
  mutationFn: async (id: string) => {
    await send(`/api/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});
