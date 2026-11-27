import {
  isSpaceColor,
  normalizeSpaceDescription,
  normalizeSpaceName,
  SPACE_COLORS,
  type SpaceColor,
  spaceDescriptionError,
  spaceNameError,
} from "@crm/core/chat";
import { Button } from "@crm/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm/ui/components/field";
import { SpaceDot } from "@crm/ui/components/space-dot";
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
import { TextField } from "../text-field.tsx";

export interface SpaceInput {
  readonly name: string;
  readonly description: string;
  readonly color: SpaceColor;
}

export interface SpaceSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Editing an existing space; a new one when absent. */
  readonly initial?: SpaceInput;
  /** Resolves when saved (a mutation's `mutateAsync`); a rejection keeps the sheet open. */
  readonly onSave: (input: SpaceInput) => Promise<void>;
}

/** A space's name, description and colour, in the side sheet (ADR 0020). */
export function SpaceSheet({ open, onOpenChange, initial, onSave }: SpaceSheetProps) {
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent>
        {/* A fresh form each time the sheet opens. */}
        {open && (
          <SpaceForm initial={initial} onSave={onSave} onClose={() => onOpenChange(false)} />
        )}
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}

function SpaceForm({
  initial,
  onSave,
  onClose,
}: {
  initial: SpaceInput | undefined;
  onSave: (input: SpaceInput) => Promise<void>;
  onClose: () => void;
}) {
  const form = useForm({
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      color: initial?.color ?? "blue",
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      const name = normalizeSpaceName(value.name);
      const description = normalizeSpaceDescription(value.description);

      // The validators already ran; this only narrows the types.
      if (!name.ok || !description.ok || !isSpaceColor(value.color)) return;

      await onSave({ name: name.value, description: description.value, color: value.color })
        .then(onClose)
        .catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <AdaptiveSheetHeader>
        <AdaptiveSheetTitle>{initial ? "Edit space" : "New space"}</AdaptiveSheetTitle>
        <AdaptiveSheetDescription>
          Members of a space see its chats. Anyone in the workspace can find it and join.
        </AdaptiveSheetDescription>
      </AdaptiveSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <form.Field name="name" validators={{ onDynamic: ({ value }) => spaceNameError(value) }}>
            {(field) => (
              <TextField field={field} label="Name" placeholder="Sales" autoComplete="off" />
            )}
          </form.Field>
          <form.Field
            name="description"
            validators={{ onDynamic: ({ value }) => spaceDescriptionError(value) }}
          >
            {(field) => {
              const error =
                form.state.submissionAttempts > 0 || field.state.meta.isDirty
                  ? field.state.meta.errors.find(Boolean)
                  : undefined;

              return (
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor="space-description">Description</FieldLabel>
                  <Textarea
                    id="space-description"
                    name={field.name}
                    rows={3}
                    placeholder="Deals, pipeline reviews and forecasts."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={error ? true : undefined}
                  />
                  {error ? (
                    <FieldError>{String(error)}</FieldError>
                  ) : (
                    <FieldDescription>
                      Optional. Shown on the Spaces page and in ⌘K.
                    </FieldDescription>
                  )}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="color">
            {(field) => (
              <Field>
                <FieldLabel>Colour</FieldLabel>
                <div className="flex gap-1">
                  {SPACE_COLORS.map((color) => (
                    <Button
                      key={color}
                      type="button"
                      size="icon-sm"
                      variant={field.state.value === color ? "secondary" : "ghost"}
                      aria-pressed={field.state.value === color}
                      aria-label={`Colour: ${color}`}
                      onClick={() => field.handleChange(color)}
                    >
                      <SpaceDot color={color} />
                    </Button>
                  ))}
                </div>
              </Field>
            )}
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
                {initial ? "Save" : "Create space"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </AdaptiveSheetFooter>
    </form>
  );
}
