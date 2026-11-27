import { memoryNoteError } from "@crm/core/memory";
import { Button } from "@crm/ui/components/button";
import { Field, FieldDescription, FieldError } from "@crm/ui/components/field";
import { Textarea } from "@crm/ui/components/textarea";
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
import { toast } from "sonner";
import { addNoteMutation, type MemoryTarget } from "../../lib/memory.ts";

/** A note in a member's own words. Supermemory reads its facts in the background. */
export function AddNoteSheet({
  target,
  subject,
  onClose,
}: {
  target: MemoryTarget;
  subject: string;
  onClose: () => void;
}) {
  const add = useMutation({
    ...addNoteMutation,
    onSuccess: () => {
      toast.success("Note saved. Its facts appear in a few seconds.");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { text: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await add.mutateAsync({ ...target, text: value.text.trim() }).catch(() => undefined);
    },
  });

  return (
    <AdaptiveSheet open onOpenChange={(open) => (open ? undefined : onClose())}>
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
            <AdaptiveSheetTitle>Add note</AdaptiveSheetTitle>
            <AdaptiveSheetDescription>
              {`Something lasting about ${subject}. The assistant recalls it in later chats.`}
            </AdaptiveSheetDescription>
          </AdaptiveSheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <form.Field
              name="text"
              validators={{ onDynamic: ({ value }) => memoryNoteError(value) }}
            >
              {(field) => {
                const error =
                  form.state.submissionAttempts > 0
                    ? field.state.meta.errors.find(Boolean)
                    : undefined;

                return (
                  <Field data-invalid={error ? true : undefined}>
                    <Textarea
                      name={field.name}
                      aria-label="Note"
                      rows={8}
                      placeholder="We renew every March. Procurement needs a security review first."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={error ? true : undefined}
                    />
                    {error ? (
                      <FieldError>{String(error)}</FieldError>
                    ) : (
                      <FieldDescription>No passwords or private personal details.</FieldDescription>
                    )}
                  </Field>
                );
              }}
            </form.Field>
          </div>
          <AdaptiveSheetFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <Button type="submit" loading={submitting}>
                    Add note
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
