import { skillDescriptionError, skillInstructionsError, skillNameError } from "@crm/integrations";
import { Button } from "@crm/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm/ui/components/field";
import { Textarea } from "@crm/ui/components/textarea";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createSkillMutation } from "../../lib/skills.ts";
import { TextField } from "../text-field.tsx";

export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

export const EMPTY_SKILL: SkillDraft = { name: "", description: "", content: "" };

/** The instructions field: a tall textarea with the shared error and hint treatment. */
function InstructionsField({ field }: { field: AnyFieldApi }) {
  const { isTouched, isDirty } = field.state.meta;
  const submitted = field.form.state.submissionAttempts > 0;

  const error =
    isTouched && (isDirty || submitted) ? field.state.meta.errors.find(Boolean) : undefined;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="field-content">Instructions</FieldLabel>
      <Textarea
        id="field-content"
        name="content"
        rows={14}
        value={String(field.state.value ?? "")}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error ? true : undefined}
        placeholder={"When reviewing a deal:\n1. Check the stage and the next step.\n2. …"}
      />
      {error ? (
        <FieldError>{String(error)}</FieldError>
      ) : (
        <FieldDescription>
          Markdown. The assistant reads this when the skill applies.
        </FieldDescription>
      )}
    </Field>
  );
}

/**
 * Write a skill for the workspace, or review an uploaded SKILL.md before saving it. Uses the
 * same rules as the API (`@crm/integrations`). A saved skill is enabled at once.
 */
export function CreateSkillSheet({
  initial,
  onClose,
  onCreated,
}: {
  initial: SkillDraft;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useMutation({
    ...createSkillMutation,
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      const skill = await create.mutateAsync(value).catch(() => null);

      if (!skill) return;

      toast(`${skill.name} is added for the workspace.`);
      onCreated(skill.id);
    },
  });

  return (
    <AdaptiveSheet open onOpenChange={(open) => (open ? undefined : onClose())} size="wide">
      <AdaptiveSheetContent>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <AdaptiveSheetHeader>
            <AdaptiveSheetTitle>New skill</AdaptiveSheetTitle>
            <AdaptiveSheetDescription>
              Teach the assistant how your workspace does something. Everyone in the workspace
              shares it.
            </AdaptiveSheetDescription>
          </AdaptiveSheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <form.Field
                name="name"
                validators={{ onDynamic: ({ value }) => skillNameError(value) }}
              >
                {(field) => (
                  <TextField
                    field={field}
                    label="Name"
                    placeholder="deal-review"
                    autoComplete="off"
                  />
                )}
              </form.Field>
              <form.Field
                name="description"
                validators={{ onDynamic: ({ value }) => skillDescriptionError(value) }}
              >
                {(field) => (
                  <TextField
                    field={field}
                    label="When to use it"
                    placeholder="Review a deal before the forecast call."
                    autoComplete="off"
                    description="The assistant reads this to decide when the skill applies."
                  />
                )}
              </form.Field>
              <form.Field
                name="content"
                validators={{ onDynamic: ({ value }) => skillInstructionsError(value) }}
              >
                {(field) => <InstructionsField field={field} />}
              </form.Field>
            </FieldGroup>
          </div>
          <AdaptiveSheetFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <Button type="submit" loading={submitting}>
                    Add skill
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
