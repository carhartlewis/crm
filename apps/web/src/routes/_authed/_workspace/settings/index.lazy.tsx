import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { WorkspaceSettings } from "../../../../components/settings/workspace-settings.tsx";
import { workspaceQuery } from "../../../../lib/session.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/")({
  component: WorkspaceGeneral,
});

/** The workspace's name and website, shared by every member. */
function WorkspaceGeneral() {
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const { data: workspace } = useSuspenseQuery(workspaceQuery(session.user.id, workspaceId));

  return (
    <SettingsPage title="General">
      <WorkspaceSettings
        key={workspace.id}
        workspace={{
          id: workspace.id,
          name: workspace.name,
          website: String(workspace.website ?? ""),
          logo: workspace.logo ?? null,
        }}
      />
    </SettingsPage>
  );
}
