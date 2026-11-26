import {
  companyDomainError,
  companyNameError,
  normalizeCompanyDomain,
  normalizeCompanyName,
} from "@crm/core/company";
import { Button } from "@crm/ui/components/button";
import { FieldGroup } from "@crm/ui/components/field";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import type { ReactNode } from "react";
import type { CompanyInput } from "../../lib/companies.ts";
import { TextField } from "../text-field.tsx";

export interface CompanyFormProps {
  readonly initial?: CompanyInput;
  readonly submitLabel: string;
  /** Resolves when saved; a rejection keeps the form open with its values. */
  readonly onSubmit: (input: CompanyInput) => Promise<void>;
  /** Rendered beside the submit button (e.g. Cancel). */
  readonly secondary?: ReactNode;
}

/** Name and domain, validated with the same rules the API enforces (@crm/core/company). */
export function CompanyForm({ initial, submitLabel, onSubmit, secondary }: CompanyFormProps) {
  const form = useForm({
    defaultValues: { name: initial?.name ?? "", domain: initial?.domain ?? "" },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      const name = normalizeCompanyName(value.name);
      const domain = normalizeCompanyDomain(value.domain);

      // The validators already ran; this only narrows the types.
      if (!name.ok || !domain.ok) return;

      await onSubmit({ name: name.name, domain: domain.domain }).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field name="name" validators={{ onDynamic: ({ value }) => companyNameError(value) }}>
          {(field) => (
            <TextField
              field={field}
              label="Name"
              placeholder="Acme Inc."
              autoComplete="organization"
            />
          )}
        </form.Field>
        <form.Field
          name="domain"
          validators={{ onDynamic: ({ value }) => companyDomainError(value) }}
        >
          {(field) => (
            <TextField
              field={field}
              label="Domain"
              placeholder="acme.com"
              inputMode="url"
              autoComplete="url"
              description="Optional. Used to match people and email to this company."
            />
          )}
        </form.Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        {secondary}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
