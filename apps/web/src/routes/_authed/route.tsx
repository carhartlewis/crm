import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQuery } from "../../lib/session.ts";

/**
 * Every signed-in route lives under this pathless layout, so none can forget the guard.
 * Children read a non-null `session` from route context.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionQuery);

    if (!session) {
      throw redirect({
        to: "/sign-in",
        search: location.href === "/" ? {} : { redirect: location.href },
        replace: true,
      });
    }

    return { session };
  },
});
