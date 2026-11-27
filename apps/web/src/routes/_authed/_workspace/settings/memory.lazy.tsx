import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { MemoryActions, MemoryView } from "../../../../components/memory/memory-view.tsx";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { workspaceQuery } from "../../../../lib/session.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/memory")({
  component: WorkspaceMemory,
});

/**
 * What the CRM remembers about the workspace's own company: website research from when the
 * workspace was created, members' notes, chats with the assistant and sent emails (ADR 0014).
 */
function WorkspaceMemory() {
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const { data: workspace } = useSuspenseQuery(workspaceQuery(session.user.id, workspaceId));

  return (
    <SettingsPage title="Workspace Memory" fill actions={<MemoryActions />}>
      <MemoryView
        key={workspaceId}
        userId={session.user.id}
        workspaceId={workspaceId}
        target={{}}
        subject={workspace.name}
        fill
      />
    </SettingsPage>
  );
}
