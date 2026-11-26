import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../../../lib/auth.ts";
import { resetAuth, workspacesQuery } from "../../../lib/session.ts";

/**
 * Routes that need a workspace live under this pathless layout. Users without one go to setup;
 * a session created before the user joined gets their first workspace activated before render,
 * so no page shows a workspace the server hasn't activated. The shell itself (sidebar, menus,
 * ⌘K) is in route.lazy.tsx, outside the cold-entry bundle.
 */
export const Route = createFileRoute("/_authed/_workspace")({
  beforeLoad: async ({ context: { queryClient, session } }) => {
    const [first] = await queryClient.fetchQuery(workspacesQuery(session.user.id));

    if (!first) throw redirect({ to: "/setup-workspace", replace: true });

    if (session.session.activeOrganizationId) return;

    const { error } = await authClient.organization.setActive({ organizationId: first.id });

    if (error) throw new Error(error.message ?? "Couldn't open your workspace");

    await resetAuth(queryClient);
  },
});
