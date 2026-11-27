import { Field, FieldDescription, FieldError, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import type { AnyFieldApi } from "@tanstack/react-form";
import type { ComponentProps } from "react";

interface TextFieldProps
  extends Omit<ComponentProps<typeof Input>, "id" | "name" | "value" | "onChange" | "onBlur"> {
  field: AnyFieldApi;
  label: string;
  description?: string;
}

/** A TanStack Form field rendered with the shared Field primitives: label, input, then error or hint. */
export function TextField({ field, label, description, ...input }: TextFieldProps) {
  // Errors wait for intent: a changed value, or a submit. Tabbing through or clicking away from an
  // untouched empty field says nothing yet.
  const { isTouched, isDirty } = field.state.meta;
  const submitted = field.form.state.submissionAttempts > 0;

  const error =
    isTouched && (isDirty || submitted) ? field.state.meta.errors.find(Boolean) : undefined;

  const id = `field-${field.name}`;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={field.name}
        value={String(field.state.value ?? "")}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error ? true : undefined}
        {...input}
      />
      {error ? (
        <FieldError>{String(error)}</FieldError>
      ) : (
        description && <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  );
}
