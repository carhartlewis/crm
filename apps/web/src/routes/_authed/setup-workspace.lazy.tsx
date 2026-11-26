import { websiteError, workspaceNameError } from "@crm/core/workspace";
import { Button } from "@crm/ui/components/button";
import { FieldGroup } from "@crm/ui/components/field";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { OnboardingShell } from "../../components/onboarding-shell.tsx";
import { TextField } from "../../components/text-field.tsx";
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

  const form = useForm({
    defaultValues: { name: "", website: "" },
    // Validate when a field is left or on submit; after a submit, re-check live as the user types.
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: ({ value }) => create.mutateAsync(value).catch(() => undefined),
  });

  return (
    <OnboardingShell title="Set up your workspace">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex w-full max-w-md flex-col gap-6 text-left"
      >
        <FieldGroup>
          <form.Field
            name="name"
            validators={{ onDynamic: ({ value }) => workspaceNameError(value) }}
          >
            {(field) => (
              <TextField
                field={field}
                label="Workspace name"
                placeholder="Acme Inc."
                autoComplete="organization"
              />
            )}
          </form.Field>
          <form.Field name="website" validators={{ onDynamic: ({ value }) => websiteError(value) }}>
            {(field) => (
              <TextField
                field={field}
                label="Website"
                placeholder="acme.com"
                inputMode="url"
                autoComplete="url"
                description="Your company's site. We use it to recognise your team's domain."
              />
            )}
          </form.Field>
        </FieldGroup>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button size="hero" type="submit" loading={submitting}>
              Create workspace
            </Button>
          )}
        </form.Subscribe>
      </form>
    </OnboardingShell>
  );
}
