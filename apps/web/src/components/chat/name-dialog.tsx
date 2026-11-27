import { Button } from "@crm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { TextField } from "../text-field.tsx";

export interface NameDialogProps {
  readonly title: string;
  readonly description?: string;
  readonly label: string;
  readonly action: string;
  readonly initial?: string;
  /** The shared rule from `@crm/core/chat`: the error message, or undefined when valid. */
  readonly validate: (value: string) => string | undefined;
  /** Runs the save (a mutation's `mutateAsync`); the dialog closes when it resolves. */
  readonly onSave: (name: string) => Promise<void>;
  readonly onClose: () => void;
}

/** One name field in a dialog: rename a chat, or name a new folder or space. */
export function NameDialog({
  title,
  description,
  label,
  action,
  initial = "",
  validate,
  onSave,
  onClose,
}: NameDialogProps) {
  const form = useForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await onSave(value.name.trim());
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit().catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form.Field name="name" validators={{ onDynamic: ({ value }) => validate(value) }}>
            {(field) => <TextField field={field} label={label} autoComplete="off" />}
          </form.Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" loading={submitting}>
                  {action}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
