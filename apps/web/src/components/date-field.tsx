import { DatePicker } from "@crm/ui/components/date-picker";
import { Field, FieldDescription, FieldError, FieldLabel } from "@crm/ui/components/field";
import type { AnyFieldApi } from "@tanstack/react-form";

/** A TanStack Form date ("2026-11-26", or "" when empty) picked from the shared calendar. */
export function DateField({
  field,
  label,
  description,
  placeholder,
}: {
  field: AnyFieldApi;
  label: string;
  description?: string;
  placeholder?: string;
}) {
  // Errors wait for intent, as in TextField.
  const { isTouched, isDirty } = field.state.meta;
  const submitted = field.form.state.submissionAttempts > 0;

  const error =
    isTouched && (isDirty || submitted) ? field.state.meta.errors.find(Boolean) : undefined;

  const id = `field-${field.name}`;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <DatePicker
        aria-invalid={error ? true : undefined}
        id={id}
        onChange={(value) => field.handleChange(value ?? "")}
        onOpenChange={(open) => {
          if (!open) field.handleBlur();
        }}
        placeholder={placeholder}
        value={String(field.state.value ?? "") || null}
      />
      {error ? (
        <FieldError>{String(error)}</FieldError>
      ) : (
        description && <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  );
}
