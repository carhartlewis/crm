import type { TrackingSettings } from "@crm/core/api";
import type { WebsiteActivity } from "@crm/core/tracking";
import { mutationOptions, type QueryClient, queryOptions } from "@tanstack/react-query";
import { request, send } from "./api-fetch.ts";

/**
 * Website tracking: the workspace's snippet key and each record's website activity. Not synced:
 * the activity is a rollup of many visits, read on demand.
 */
export const trackingKeys = {
  all: ["tracking"] as const,
  workspace: (userId: string, workspaceId: string) =>
    [...trackingKeys.all, userId, workspaceId] as const,
  settings: (userId: string, workspaceId: string) =>
    [...trackingKeys.workspace(userId, workspaceId), "settings"] as const,
  activity: (userId: string, workspaceId: string, kind: ActivityKind, id: string) =>
    [...trackingKeys.workspace(userId, workspaceId), kind, id] as const,
};

export type ActivityKind = "company" | "contact";

type Settings = typeof TrackingSettings.Type;

export const trackingSettingsQuery = (userId: string, workspaceId: string) =>
  queryOptions({
    queryKey: trackingKeys.settings(userId, workspaceId),
    queryFn: () => request<Settings>("/api/tracking"),
  });

/** A company's or contact's website activity; `null` when it has no visits. */
export const websiteActivityQuery = (
  userId: string,
  workspaceId: string,
  kind: ActivityKind,
  id: string,
) =>
  queryOptions({
    queryKey: trackingKeys.activity(userId, workspaceId, kind, id),
    queryFn: () =>
      request<WebsiteActivity | null>(
        `/api/tracking/${kind === "company" ? "companies" : "contacts"}/${encodeURIComponent(id)}`,
      ),
    staleTime: 60_000,
  });

/** Turns tracking on (or returns the key it already has). */
export const enableTrackingMutation = (
  queryClient: QueryClient,
  userId: string,
  workspaceId: string,
) =>
  mutationOptions({
    mutationKey: ["tracking", "enable"],
    mutationFn: () => request<Settings>("/api/tracking", { method: "POST" }),
    onSuccess: (settings) =>
      queryClient.setQueryData(trackingKeys.settings(userId, workspaceId), settings),
  });

export const disableTrackingMutation = (
  queryClient: QueryClient,
  userId: string,
  workspaceId: string,
) =>
  mutationOptions({
    mutationKey: ["tracking", "disable"],
    mutationFn: async () => {
      await send("/api/tracking", { method: "DELETE" });
    },
    onSuccess: () =>
      queryClient.setQueryData(trackingKeys.settings(userId, workspaceId), { key: null }),
  });
