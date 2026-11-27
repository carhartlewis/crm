import {
  CURRENCIES,
  DEAL_FIELDS,
  DEAL_STAGES,
  DEFAULT_DEAL_STAGE,
  fieldError,
  type FieldSpec,
  normalizeField,
  REPORTING_CURRENCY,
} from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { StatusDot } from "@crm/ui/components/status-dot";
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
import { parseCreateFor, useCreateFor } from "../../lib/create-sheet.ts";
import {
  createDealMutation,
  type DealInput,
  dealContactsCollection,
  dealsCollection,
} from "../../lib/deals.ts";
import { useOpenRecord } from "../../lib/records.ts";
import { ChoiceDetail, SearchDetail } from "../records/detail-fields.tsx";
import { CompanyLogo, MARK_SIZE } from "../records/record-visuals.tsx";
import { useCompanies, useContacts } from "../records/use-crm.ts";
import { DateField } from "../date-field.tsx";
import { TextField } from "../text-field.tsx";

const spec = (column: string): FieldSpec =>
  DEAL_FIELDS.find((field) => field.column === column) ?? DEAL_FIELDS[0];

const value = (column: string, raw: string) => {
  const result = normalizeField(spec(column), raw);

  return result.ok ? result.value : null;
};

export interface CreateDealSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * New deal, from anywhere. From a company's sheet it starts with that company; from a contact's,
 * with their company, and the contact goes on the deal.
 */
export default function CreateDealSheet({
  open,
  onOpenChange,
  userId,
  workspaceId,
}: CreateDealSheetProps) {
  const [createFor] = useCreateFor();
  const { companies } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const openRecord = useOpenRecord();
  const target = parseCreateFor(createFor);

  const contact = target.contactId
    ? contacts.find((entry) => entry.id === target.contactId)
    : undefined;

  const create = useMutation({
    ...createDealMutation,
    onSuccess: async (id, { input }) => {
      onOpenChange(false);
      toast.success(`${input.name} added`, {
        action: { label: "View", onClick: () => void openRecord("deal", id) },
      });

      if (contact) {
        await dealContactsCollection(workspaceId)
          .insert({
            deal_id: id,
            contact_id: contact.id,
            workspace_id: workspaceId,
            role: null,
            created_at: new Date().toISOString(),
          })
          .when("settled")
          .catch((error: Error) => toast.error(error.message));
      }
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AdaptiveSheet onOpenChange={onOpenChange} open={open}>
      <AdaptiveSheetContent>
        {open ? (
          <DealForm
            companies={companies}
            companyId={target.companyId ?? contact?.company_id ?? null}
            key={createFor ?? "new"}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (input) => {
              await create.mutateAsync({
                collection: dealsCollection(workspaceId),
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

function DealForm({
  companyId,
  companies,
  onSubmit,
  onCancel,
}: {
  companyId: string | null;
  companies: ReturnType<typeof useCompanies>["companies"];
  onSubmit: (input: DealInput) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: {
      name: "",
      company_id: companyId ?? "",
      // Plain text, so the stage field accepts every stage, not only the default.
      stage: String(DEFAULT_DEAL_STAGE),
      amount: "",
      currency: String(REPORTING_CURRENCY),
      expected_close_date: "",
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value: input }) => {
      await onSubmit({
        name: value("name", input.name) ?? "",
        company_id: input.company_id,
        stage: input.stage,
        amount: value("amount", input.amount),
        currency: input.currency,
        expected_close_date: value("expected_close_date", input.expected_close_date),
      }).catch(() => undefined);
    },
  });

  const openStages = DEAL_STAGES.filter((stage) => stage.open || stage.id === "closed_won");

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
        <AdaptiveSheetTitle>New deal</AdaptiveSheetTitle>
        <AdaptiveSheetDescription>It appears in the pipeline at once.</AdaptiveSheetDescription>
      </AdaptiveSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <form.Field
            name="name"
            validators={{ onDynamic: ({ value: raw }) => fieldError(spec("name"), raw) }}
          >
            {(field) => (
              <TextField field={field} label="Name" placeholder="Northwind — Platform rollout" />
            )}
          </form.Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="company_id"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("company_id"), raw) }}
            >
              {(field) => {
                const error =
                  form.state.submissionAttempts > 0
                    ? field.state.meta.errors.find(Boolean)
                    : undefined;

                return (
                  <Field data-invalid={error ? true : undefined}>
                    <FieldLabel>Company</FieldLabel>
                    <SearchDetail
                      field
                      label="Company"
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
                    {error ? <FieldError>{String(error)}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="stage">
              {(field) => (
                <Field>
                  <FieldLabel>Stage</FieldLabel>
                  <ChoiceDetail
                    field
                    label="Stage"
                    onSave={(next) => next && field.handleChange(next)}
                    options={openStages.map((stage) => ({
                      value: stage.id,
                      label: stage.label,
                      mark: <StatusDot tone={stage.tone} />,
                    }))}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="amount"
              validators={{ onDynamic: ({ value: raw }) => fieldError(spec("amount"), raw) }}
            >
              {(field) => (
                <TextField field={field} inputMode="decimal" label="Amount" placeholder="186000" />
              )}
            </form.Field>
            <form.Field name="currency">
              {(field) => (
                <Field>
                  <FieldLabel>Currency</FieldLabel>
                  <ChoiceDetail
                    field
                    label="Currency"
                    onSave={(next) => next && field.handleChange(next)}
                    options={CURRENCIES.map((currency) => ({
                      value: currency.code,
                      label: `${currency.code} · ${currency.name}`,
                    }))}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="expected_close_date"
              validators={{
                onDynamic: ({ value: raw }) => fieldError(spec("expected_close_date"), raw),
              }}
            >
              {(field) => <DateField field={field} label="Expected close" />}
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
                Create deal
              </Button>
            )}
          </form.Subscribe>
        </div>
      </AdaptiveSheetFooter>
    </form>
  );
}
