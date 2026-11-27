import { websiteError, workspaceNameError } from "@crm/core/workspace";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { initials } from "../../lib/initials.ts";
import { researchMutation } from "../../lib/memory.ts";
import { updateWorkspaceMutation } from "../../lib/workspaces.ts";
import { TextField } from "../text-field.tsx";
import { SettingsCard } from "./settings-card.tsx";

export interface WorkspaceSettingsProps {
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly website: string;
    readonly logo: string | null;
  };
}

/** The workspace's name and website, one card each, as in comp-neo. Shared by every member. */
export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
  return (
    <>
      {/* A saved value comes back in the workspace query; the key starts the form from it. */}
      <WorkspaceFieldCard
        key={`name:${workspace.name}`}
        workspaceId={workspace.id}
        field="name"
        value={workspace.name}
        logo={workspace.logo}
      />
      <WorkspaceFieldCard
        key={`website:${workspace.website}`}
        workspaceId={workspace.id}
        field="website"
        value={workspace.website}
        logo={workspace.logo}
      />
    </>
  );
}

const COPY = {
  name: {
    title: "Workspace name",
    description: "The name everyone in the workspace sees.",
    hint: "Up to 64 characters.",
    label: "Name",
    saved: "Workspace name saved",
  },
  website: {
    title: "Website",
    description:
      "Your company's site. The logo comes from it, and memory researches it when it changes.",
    hint: "Use your main domain, such as acme.com.",
    label: "Website",
    saved: "Website saved",
  },
} as const;

function WorkspaceFieldCard({
  workspaceId,
  field: name,
  value,
  logo,
}: {
  workspaceId: string;
  field: "name" | "website";
  value: string;
  logo: string | null;
}) {
  const formId = useId();
  const copy = COPY[name];

  // A new website is a new company to learn about: research it into workspace memory.
  const research = useMutation({ ...researchMutation, onError: () => undefined });

  const update = useMutation({
    ...updateWorkspaceMutation,
    onSuccess: () => {
      toast.success(copy.saved);

      if (name === "website") research.mutate({});
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { value },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value: values }) => {
      await update
        .mutateAsync({ workspaceId, data: { [name]: values.value } })
        .catch(() => undefined);
    },
  });

  const validate = name === "name" ? workspaceNameError : websiteError;

  return (
    <SettingsCard
      title={copy.title}
      description={copy.description}
      hint={copy.hint}
      action={
        <form.Subscribe
          selector={(state) => ({
            submitting: state.isSubmitting,
            changed: state.values.value.trim() !== value.trim(),
          })}
        >
          {({ submitting, changed }) => (
            <Button type="submit" form={formId} size="sm" disabled={!changed} loading={submitting}>
              Save
            </Button>
          )}
        </form.Subscribe>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {name === "name" ? (
          <Avatar size="lg">
            {logo ? <AvatarImage src={logo} alt="" /> : null}
            <AvatarFallback>{initials(value)}</AvatarFallback>
          </Avatar>
        ) : null}
        <div className="min-w-0 flex-1">
          <form.Field name="value" validators={{ onDynamic: ({ value: next }) => validate(next) }}>
            {(field) => (
              <TextField
                field={field}
                label={copy.label}
                autoComplete={name === "name" ? "organization" : "url"}
                inputMode={name === "website" ? "url" : undefined}
              />
            )}
          </form.Field>
        </div>
      </form>
    </SettingsCard>
  );
}
