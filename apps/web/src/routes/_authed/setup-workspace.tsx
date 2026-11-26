import { Button } from "@crm/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { normalizeWebsite, normalizeWorkspaceName, workspaceSlug } from "@crm/core/workspace";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { OnboardingShell } from "../../components/onboarding-shell.tsx";
import { authClient } from "../../lib/auth.ts";
import { resetAuth, workspacesQuery } from "../../lib/session.ts";

export const Route = createFileRoute("/_authed/setup-workspace")({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.fetchQuery(
      workspacesQuery(context.session.user.id),
    );

    if (workspaces.length > 0) throw redirect({ to: "/", replace: true });
  },
  component: SetupWorkspace,
});

interface FieldErrors {
  name?: string;
  website?: string;
}

/** Creates the workspace; a taken slug retries with a short random suffix. */
async function createWorkspace(name: string, website: string) {
  for (const suffix of [
    undefined,
    ...Array.from({ length: 3 }, () => crypto.randomUUID().slice(0, 4)),
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt depends on the previous one failing.
    const { error } = await authClient.organization.create({
      name,
      website,
      slug: workspaceSlug(name, suffix),
    });

    if (!error) return;

    if (error.code !== "ORGANIZATION_ALREADY_EXISTS")
      throw new Error(error.message ?? "Could not create the workspace");
  }

  throw new Error("Could not find a free workspace URL. Try a different name.");
}

function SetupWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = normalizeWorkspaceName(String(form.get("name") ?? ""));
    const website = normalizeWebsite(String(form.get("website") ?? ""));

    const next: FieldErrors = {};

    if (!name.ok) next.name = name.message;

    if (!website.ok) next.website = website.message;

    setErrors(next);

    if (!name.ok || !website.ok) return;

    setPending(true);

    try {
      await createWorkspace(name.name, website.url);
      await resetAuth(queryClient);
      await navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the workspace");
    } finally {
      setPending(false);
    }
  };

  return (
    <OnboardingShell title="Set up your workspace">
      <form noValidate onSubmit={submit} className="flex w-full max-w-md flex-col gap-6 text-left">
        <FieldGroup>
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="name">Workspace name</FieldLabel>
            <Input
              id="name"
              name="name"
              autoComplete="organization"
              placeholder="Acme Inc."
              aria-invalid={errors.name ? true : undefined}
              required
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={errors.website ? true : undefined}>
            <FieldLabel htmlFor="website">Website</FieldLabel>
            <Input
              id="website"
              name="website"
              inputMode="url"
              autoComplete="url"
              placeholder="acme.com"
              aria-invalid={errors.website ? true : undefined}
              required
            />
            {errors.website ? (
              <FieldError>{errors.website}</FieldError>
            ) : (
              <FieldDescription>
                Your company's site. We use it to recognise your team's domain.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
        <Button size="hero" type="submit" loading={pending}>
          Create workspace
        </Button>
      </form>
    </OnboardingShell>
  );
}
