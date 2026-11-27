import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateConnectionsSearch } from "./settings/connections.tsx";

/**
 * The old Connections page, now in settings. Kept so bookmarks and app sign-ins that started
 * before the move (the API's OAuth callback redirected here) still land with their outcome.
 */
export const Route = createFileRoute("/_authed/_workspace/connections")({
  validateSearch: validateConnectionsSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/settings/connections", search, replace: true });
  },
});
