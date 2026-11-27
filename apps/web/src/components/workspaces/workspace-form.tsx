import { websiteError, workspaceNameError, type WorkspaceInput } from "@crm/core/workspace";
import { Button } from "@crm/ui/components/button";
import { FieldGroup } from "@crm/ui/components/field";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { TextField } from "../text-field.tsx";

export interface WorkspaceFormProps {
  /** Resolves when the workspace exists; a rejection keeps the form and its values. */
  readonly onSubmit: (value: WorkspaceInput) => Promise<void>;
  /** Under the submit button, e.g. a way back. */
  readonly footer?: ReactNode;
  /** The saved values, when editing a workspace. */
  readonly initial?: WorkspaceInput;
  /** Defaults to "Create workspace" for the onboarding shell. */
  readonly submitLabel?: string;
}

/** Workspace name and website (shared rules from @crm/core/workspace), for the onboarding shell. */
export function WorkspaceForm({
  onSubmit,
  footer,
  initial,
  submitLabel = "Create workspace",
}: WorkspaceFormProps) {
  const form = useForm({
    defaultValues: { name: initial?.name ?? "", website: initial?.website ?? "" },
    // Validate when a field is left or on submit; after a submit, re-check live as the user types.
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await onSubmit(value).catch(() => undefined);
    },
  });

  return (
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
          <Button size={initial ? "default" : "hero"} type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        )}
      </form.Subscribe>
      {footer}
    </form>
  );
}
