import { CONTACT_FIELDS, fieldError, type FieldSpec, normalizeField } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
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
import {
  type ContactInput,
  contactsCollection,
  createContactMutation,
} from "../../lib/contacts.ts";
import { parseCreateFor, useCreateFor } from "../../lib/create-sheet.ts";
import { useOpenRecord } from "../../lib/records.ts";
import { SearchDetail } from "../records/detail-fields.tsx";
import { CompanyLogo, MARK_SIZE } from "../records/record-visuals.tsx";
import { useCompanies } from "../records/use-crm.ts";
import { TextField } from "../text-field.tsx";

const spec = (column: string): FieldSpec =>
  CONTACT_FIELDS.find((field) => field.column === column) ?? CONTACT_FIELDS[0];

const value = (column: string, raw: string) => {
  const result = normalizeField(spec(column), raw);

  return result.ok ? result.value : null;
};

export interface CreateContactSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly userId: string;
  readonly workspaceId: string;
}

/** New contact, from anywhere; from a company's sheet it starts at that company. */
export default function CreateContactSheet({
  open,
  onOpenChange,
  userId,
  workspaceId,
}: CreateContactSheetProps) {
  const [createFor] = useCreateFor();
  const { companies } = useCompanies(workspaceId);
  const openRecord = useOpenRecord();

  const create = useMutation({
    ...createContactMutation,
    onSuccess: (id, { input }) => {
      onOpenChange(false);
      toast.success(`${input.first_name} added`, {
        action: { label: "View", onClick: () => void openRecord("contact", id) },
      });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AdaptiveSheet onOpenChange={onOpenChange} open={open}>
      <AdaptiveSheetContent>
        {/* A new start each time it opens, at the company it was opened from. */}
        {open ? (
          <ContactForm
            companyId={parseCreateFor(createFor).companyId}
            companies={companies}
            key={createFor ?? "new"}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (input) => {
              await create.mutateAsync({
                collection: contactsCollection(workspaceId),
                workspaceId,
                ownerId: userId,
                input,
              });
            }}
          />
        ) : null}
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}

function ContactForm({
  companyId,
  companies,
  onSubmit,
  onCancel,
}: {
  companyId: string | null;
  companies: ReturnType<typeof useCompanies>["companies"];
  onSubmit: (input: ContactInput) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: {
      first_name: "",
      last_name: "",
      title: "",
      email: "",
      phone: "",
      company_id: companyId ?? "",
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value: input }) => {
      await onSubmit({
        first_name: value("first_name", input.first_name) ?? "",
        last_name: value("last_name", input.last_name),
        title: value("title", input.title),
        email: value("email", input.email),
        phone: value("phone", input.phone),
        company_id: input.company_id || null,
      }).catch(() => undefined);
    },
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <AdaptiveSheetHeader>
        <AdaptiveSheetTitle>New contact</AdaptiveSheetTitle>
        <AdaptiveSheetDescription>
          It appears at once and syncs to your workspace.
        </AdaptiveSheetDescription>
      </AdaptiveSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="first_name"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("first_name"), raw) }}
            >
              {(field) => (
                <TextField
                  field={field}
                  label={spec("first_name").label}
                  placeholder="Priya"
                  autoComplete="given-name"
                />
              )}
            </form.Field>
            <form.Field
              name="last_name"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("last_name"), raw) }}
            >
              {(field) => (
                <TextField
                  field={field}
                  label={spec("last_name").label}
                  placeholder="Raghunathan"
                  autoComplete="family-name"
                />
              )}
            </form.Field>
          </div>
          <form.Field
            name="title"
            validators={{ onDynamic: ({ value: raw }) => fieldError(spec("title"), raw) }}
          >
            {(field) => (
              <TextField
                field={field}
                label={spec("title").label}
                placeholder="VP of Engineering"
                autoComplete="organization-title"
              />
            )}
          </form.Field>
          <form.Field name="company_id">
            {(field) => (
              <Field>
                <FieldLabel>Company</FieldLabel>
                <SearchDetail
                  field
                  label="Company"
                  none="No company"
                  onSave={(next) => field.handleChange(next ?? "")}
                  options={companies
                    .filter((company) => !company.archived_at)
                    .map((company) => ({
                      value: company.id,
                      label: company.name,
                      mark: <CompanyLogo company={company} size={MARK_SIZE} />,
                    }))}
                  placeholder="Search companies…"
                  value={field.state.value || null}
                />
              </Field>
            )}
          </form.Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="email"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("email"), raw) }}
            >
              {(field) => (
                <TextField
                  field={field}
                  label={spec("email").label}
                  placeholder="priya@northwind.io"
                  autoComplete="email"
                  type="email"
                />
              )}
            </form.Field>
            <form.Field
              name="phone"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("phone"), raw) }}
            >
              {(field) => (
                <TextField
                  field={field}
                  label={spec("phone").label}
                  placeholder="+1 415 555 0142"
                  autoComplete="tel"
                  type="tel"
                />
              )}
            </form.Field>
          </div>
        </FieldGroup>
      </div>
      <AdaptiveSheetFooter>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <Button loading={submitting} type="submit">
                Create contact
              </Button>
            )}
          </form.Subscribe>
        </div>
      </AdaptiveSheetFooter>
    </form>
  );
}
