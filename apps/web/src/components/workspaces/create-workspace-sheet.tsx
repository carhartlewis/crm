import { websiteError, workspaceNameError } from "@crm/core/workspace";
import { Button } from "@crm/ui/components/button";
import { FieldGroup } from "@crm/ui/components/field";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createAndOpenWorkspaceMutation } from "../../lib/workspaces.ts";
import { TextField } from "../text-field.tsx";

export interface CreateWorkspaceSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Create new workspace (from the workspace menu): the setup form's fields and rules, in the
 * shell's create sheet. Success moves you into the new workspace's Home.
 */
export default function CreateWorkspaceSheet({ open, onOpenChange }: CreateWorkspaceSheetProps) {
  const navigate = useNavigate();

  const create = useMutation({
    ...createAndOpenWorkspaceMutation,
    onSuccess: async (workspace) => {
      onOpenChange(false);
      await navigate({ to: "/" });
      toast.success(`Welcome to ${workspace.name}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { name: "", website: "" },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: ({ value }) => create.mutateAsync(value).catch(() => undefined),
  });

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <AdaptiveSheetHeader>
            <AdaptiveSheetTitle>New workspace</AdaptiveSheetTitle>
            <AdaptiveSheetDescription>
              A separate space for another team or company. You can switch between them any time.
            </AdaptiveSheetDescription>
          </AdaptiveSheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
              <form.Field
                name="website"
                validators={{ onDynamic: ({ value }) => websiteError(value) }}
              >
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
          </div>
          <AdaptiveSheetFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <Button type="submit" loading={submitting}>
                    Create workspace
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </AdaptiveSheetFooter>
        </form>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
