import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { OnboardingShell } from "../../components/onboarding-shell.tsx";
import { WorkspaceForm } from "../../components/workspaces/workspace-form.tsx";
import { resetAuth } from "../../lib/session.ts";
import { createWorkspaceMutation } from "../../lib/workspaces.ts";

export const Route = createLazyFileRoute("/_authed/setup-workspace")({
  component: SetupWorkspace,
});

function SetupWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    ...createWorkspaceMutation,
    onSuccess: async () => {
      await resetAuth(queryClient);
      await navigate({ to: "/", replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <OnboardingShell title="Set up your workspace">
      <WorkspaceForm
        onSubmit={async (value) => {
          await create.mutateAsync(value);
        }}
      />
    </OnboardingShell>
  );
}
