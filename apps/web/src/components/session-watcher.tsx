import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { sessionQuery } from "../lib/session.ts";

/**
 * Keeps the app honest about the session after load. The session query refetches on window
 * focus; this subscribes to the query cache (an external store) and, when the signed-in user
 * changes (signed out, signed in in another tab, a different account), re-runs the route guards.
 * The guards alone decide where each state belongs. Then the previous user's data is dropped:
 * user data is keyed by user id (see `authKeys`).
 */
export function SessionWatcher() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useQuery({ ...sessionQuery, refetchOnWindowFocus: "always" });

  // Leave the previous user's pages before removing the data they render.
  const reroute = async (previousUser: string | undefined) => {
    await router.invalidate();

    if (previousUser) {
      queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(previousUser) });
    }
  };

  useMountEffect(() => {
    let userId = queryClient.getQueryData(sessionQuery.queryKey)?.user.id;

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;

      if (event.query.queryHash !== JSON.stringify(sessionQuery.queryKey)) return;

      const previousUser = userId;

      userId = queryClient.getQueryData(sessionQuery.queryKey)?.user.id;

      if (userId === previousUser) return;

      void reroute(previousUser);
    });
  });

  return null;
}
