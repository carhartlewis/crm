import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Settings pages. The sidebar swaps to their links (see AppSidebar). */
export const Route = createFileRoute("/_authed/_workspace/settings")({
  component: Outlet,
});
