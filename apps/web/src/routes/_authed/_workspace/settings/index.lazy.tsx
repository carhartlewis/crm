import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CurrencySettings } from "../../../../components/settings/currency-settings.tsx";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { TrackingSettings } from "../../../../components/settings/tracking-settings.tsx";
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
      <CurrencySettings key={`currency:${workspace.id}`} workspaceId={workspace.id} />
      <TrackingSettings
        key={`tracking:${workspace.id}`}
        userId={session.user.id}
        workspaceId={workspace.id}
      />
    </SettingsPage>
  );
}
