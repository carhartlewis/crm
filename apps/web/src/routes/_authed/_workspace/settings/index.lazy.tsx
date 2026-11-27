import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { WorkspaceForm } from "../../../../components/workspaces/workspace-form.tsx";
import { workspaceQuery } from "../../../../lib/session.ts";
import { updateWorkspaceMutation } from "../../../../lib/workspaces.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/")({
  component: WorkspaceGeneral,
});

/** The workspace's name and website, shared by every member. */
function WorkspaceGeneral() {
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const { data: workspace } = useSuspenseQuery(workspaceQuery(session.user.id, workspaceId));

  const update = useMutation({
    ...updateWorkspaceMutation,
    onSuccess: () => toast.success("Workspace saved"),
    onError: (error) => toast.error(error.message),
  });

  return (
    <SettingsPage title="General">
      <WorkspaceForm
        // Another workspace is another form.
        key={workspace.id}
        initial={{ name: workspace.name, website: String(workspace.website ?? "") }}
        submitLabel="Save"
        onSubmit={async (value) => {
          await update.mutateAsync({ workspaceId: workspace.id, value });
        }}
      />
    </SettingsPage>
  );
}
