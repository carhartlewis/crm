import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { authKeys, sessionQuery } from "../lib/session.ts";

const PUBLIC_PATHS = new Set(["/sign-in"]);

/**
 * Keeps the app honest about the session after load. The session query refetches on window
 * focus; this subscribes to the query cache (an external store) and reacts to the result:
 * session gone → back to sign-in from any route; signed in (e.g. in another tab) while on
 * sign-in → into the app; a different user → drop the previous user's cached data.
 */
export function SessionWatcher() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useQuery({ ...sessionQuery, refetchOnWindowFocus: "always" });

  useMountEffect(() => {
    let userId = queryClient.getQueryData(sessionQuery.queryKey)?.user.id;

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;

      if (event.query.queryHash !== JSON.stringify(sessionQuery.queryKey)) return;

      const session = queryClient.getQueryData(sessionQuery.queryKey);
      const onPublicPage = PUBLIC_PATHS.has(router.state.location.pathname);
      const previousUser = userId;

      userId = session?.user.id;

      if (!session && !onPublicPage) {
        void router.navigate({ to: "/sign-in", replace: true }).then(() => queryClient.clear());
      } else if (session && onPublicPage) {
        void router.navigate({ to: "/", replace: true });
      } else if (session && previousUser && previousUser !== session.user.id) {
        void queryClient.invalidateQueries({ queryKey: authKeys.all });
      }
    });
  });

  return null;
}
