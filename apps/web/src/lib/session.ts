import { desktopBridge } from "@crm/core/desktop";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
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

/**
 * Starts Google sign-in and returns once this page is on its way out. Web: the browser leaves
 * for Google. Electron: Google signs in in the system browser (RFC 8252); the single-use code is
 * redeemed with the PKCE verifier only this app holds, and the refetched session moves the page
 * on (SessionWatcher → the _guest guard). So success means "leaving", not "done".
 */
export const signInMutation = mutationOptions({
  mutationKey: [...authKeys.all, "sign-in"],
  mutationFn: async ({ returnTo }: { returnTo: string }, { client }) => {
    const desktop = desktopBridge();

    if (!desktop) {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(returnTo, window.location.origin).href,
        errorCallbackURL: new URL("/sign-in", window.location.origin).href,
      });

      if (error) throw new Error(error.message ?? "Couldn't start Google sign-in");

      return;
    }

    const handoff = await desktop.signInWithGoogle();
    const { error } = await authClient.$fetch("/desktop/redeem", { method: "POST", body: handoff });

    if (error) throw new Error(error.message ?? "Sign-in could not be completed");

    await resetAuth(client);
  },
});

/** Ends the session. SessionWatcher sees it go: the guards move to sign-in, then the data goes. */
export const signOutMutation = mutationOptions({
  mutationKey: [...authKeys.all, "sign-out"],
  mutationFn: async (_: void, { client }) => {
    const { error } = await authClient.signOut();

    if (error) throw new Error(error.message ?? "Couldn't sign out");

    client.setQueryData(sessionQuery.queryKey, null);
  },
});
