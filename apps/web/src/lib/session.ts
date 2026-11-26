import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { authClient } from "./auth.ts";

/**
 * Query keys for auth state. Workspaces are keyed by user so one account's cache can never be
 * served to another. Guards read with `fetchQuery` (honours invalidation; `ensureQueryData`
 * returns stale data after invalidation), components with `useSuspenseQuery`.
 */
export const authKeys = {
  all: ["auth"] as const,
  session: () => [...authKeys.all, "session"] as const,
  workspaces: (userId: string) => [...authKeys.all, "workspaces", userId] as const,
};

export const sessionQuery = queryOptions({
  queryKey: authKeys.session(),
  queryFn: async () => {
    const { data, error } = await authClient.getSession();

    if (error) throw new Error(error.message ?? "Couldn't load your session");

    return data;
  },
});

export const workspacesQuery = (userId: string) =>
  queryOptions({
    queryKey: authKeys.workspaces(userId),
    queryFn: async () => {
      const { data, error } = await authClient.organization.list();

      if (error) throw new Error(error.message ?? "Couldn't load your workspaces");

      return data;
    },
  });

/** Drops cached auth state after a workspace change or sign-in elsewhere. */
export function resetAuth(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: authKeys.all });
}

/** Only same-origin paths survive a `?redirect=`, so sign-in can't be used as an open redirect. */
export function safeRedirect(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : undefined;
}
