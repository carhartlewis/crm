import { createFileRoute, redirect } from "@tanstack/react-router";
import { workspacesQuery } from "../../lib/session.ts";

/** Critical half (guard). The form lives in setup-workspace.lazy.tsx, its own chunk. */
export const Route = createFileRoute("/_authed/setup-workspace")({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.fetchQuery(
      workspacesQuery(context.session.user.id),
    );

    if (workspaces.length > 0) throw redirect({ to: "/", replace: true });
  },
});
