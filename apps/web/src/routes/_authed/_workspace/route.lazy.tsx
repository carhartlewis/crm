import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "../../../components/shell/workspace-shell.tsx";
import { sessionQuery } from "../../../lib/session.ts";

export const Route = createLazyFileRoute("/_authed/_workspace")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { session } = Route.useRouteContext();
  const { data: current } = useSuspenseQuery(sessionQuery);
  const workspaceId = current?.session.activeOrganizationId;

  // The guard above activates a workspace before render; this only waits out a refetch.
  if (!workspaceId) return null;

  return <WorkspaceShell userId={session.user.id} workspaceId={workspaceId} />;
}
