import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { OnboardingShell } from "../../components/onboarding-shell.tsx";
import { WorkspaceForm } from "../../components/workspaces/workspace-form.tsx";
import { createAndOpenWorkspaceMutation } from "../../lib/workspaces.ts";

/**
 * Create new workspace, for people who already have one (setup-workspace sends them home). The
 * same page and form as first-run setup, plus a way back.
 */
export const Route = createLazyFileRoute("/_authed/new-workspace")({
  component: NewWorkspace,
});

function NewWorkspace() {
  const navigate = useNavigate();
  const router = useRouter();

  const create = useMutation({
    ...createAndOpenWorkspaceMutation,
    onSuccess: async () => {
      await navigate({ to: "/", replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <OnboardingShell title="Create a new workspace">
      <WorkspaceForm
        onSubmit={async (value) => {
          await create.mutateAsync(value);
        }}
        footer={
          <Button size="hero" variant="ghost" type="button" onClick={() => router.history.back()}>
            Cancel
          </Button>
        }
      />
    </OnboardingShell>
  );
}
