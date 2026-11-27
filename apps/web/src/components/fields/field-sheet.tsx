import add16 from "@carbon/icons/es/add/16.js";
import close16 from "@carbon/icons/es/close/16.js";
import {
  ENTITY_NAMES,
  FIELD_TYPES,
  type FieldEntity,
  type FieldType,
  fieldBriefError,
  fieldKey,
  fieldLabelError,
  fieldTypeLabel,
  isFieldType,
  normalizeFieldBrief,
  normalizeFieldLabel,
  normalizeOptionLabel,
  normalizeOptionLabels,
  optionLabelsError,
} from "@crm/core/fields";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@crm/ui/components/field";
import { carbonIcon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
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
import {
  addFieldOption,
  createField,
  type FieldDefinition,
  type FieldOption,
  saveField,
  saveFieldOption,
} from "../../lib/fields.ts";
import { ChoiceDetail } from "../records/detail-fields.tsx";
import { TextField } from "../text-field.tsx";

const AddIcon = carbonIcon(add16);
const CloseIcon = carbonIcon(close16);

const TYPE_CHOICES = FIELD_TYPES.map((type) => ({ value: type.id, label: type.hint }));

export interface FieldSheetProps {
  readonly workspaceId: string;
  readonly entity: FieldEntity;
  /** The field to edit; a new field when absent. */
  readonly field: FieldDefinition | null;
  readonly options: readonly FieldOption[];
  /** Every definition of the workspace, for the new key and position. */
  readonly existing: readonly FieldDefinition[];
  /** How many records have a value, for the subtitle. */
  readonly filled: number;
  readonly onClose: () => void;
  readonly onArchive: (field: FieldDefinition) => void;
}

/** A labelled checkbox row, as the placement and agent settings read. */
function CheckField({
  field,
  label,
  description,
}: {
  field: AnyFieldApi;
  label: string;
  description?: string;
}) {
  const id = `field-${field.name}`;

  return (
    <Field orientation="horizontal">
      <Checkbox
        checked={field.state.value === true}
        id={id}
        onCheckedChange={(checked: boolean) => field.handleChange(checked)}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </div>
    </Field>
  );
}

/**
 * New field and Edit field, in a side sheet. The label sets the key once; the type is fixed after
 * saving. A new select field's options are part of the form; an existing one's save as you edit
 * them. Validation reuses `@crm/core/fields`, the API's rules.
 */
export function FieldSheet({
  workspaceId,
  entity,
  field,
  options,
  existing,
  filled,
  onClose,
  onArchive,
}: FieldSheetProps) {
  const names = ENTITY_NAMES[entity];
  const editing = field !== null;

  const create = useMutation({
    mutationFn: async (input: Parameters<ReturnType<typeof createField>>[0]) => {
      await createField(workspaceId)(input).when("settled");
    },
    onSuccess: (_, { input }) => {
      toast.success(`${input.label} added`);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof saveField>[2]) =>
      field ? saveField(workspaceId, field.id, patch) : Promise.resolve(),
    onSuccess: onClose,
    onError: (error) => toast.error(error.message),
  });

  const initialType: FieldType = field?.type ?? "text";

  const form = useForm({
    defaultValues: {
      label: field?.label ?? "",
      type: initialType,
      agentFilled: field?.agent_filled ?? true,
      agentBrief: field?.agent_brief ?? "",
      options: editing ? [] : ["", ""],
      showOnSheet: field?.show_on_sheet ?? true,
      showOnTable: field?.show_on_table ?? false,
      showOnFilter: field?.show_on_filter ?? false,
      required: field?.required ?? false,
    },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      const label = normalizeFieldLabel(value.label);
      const brief = normalizeFieldBrief(value.agentBrief);

      if (!label.ok || !brief.ok) return;

      const common = {
        agentFilled: value.agentFilled,
        agentBrief: value.agentFilled ? brief.value : (field?.agent_brief ?? null),
        required: value.required,
        showOnSheet: value.showOnSheet,
        showOnTable: value.showOnTable,
        showOnFilter: value.showOnFilter,
      };

      if (field) {
        await save
          .mutateAsync({
            label: label.value,
            agent_filled: common.agentFilled,
            agent_brief: common.agentBrief,
            required: common.required,
            show_on_sheet: common.showOnSheet,
            show_on_table: common.showOnTable,
            show_on_filter: common.showOnFilter,
          })
          .catch(() => undefined);

        return;
      }

      const labels = value.type === "select" ? normalizeOptionLabels(value.options) : null;

      if (labels && !labels.ok) return;

      const optionLabels = labels?.ok ? labels.value : [];

      await create
        .mutateAsync({
          id: createId(ID_PREFIXES.field_definition),
          input: { entity, label: label.value, type: value.type, ...common, options: optionLabels },
          optionIds: optionLabels.map(() => createId(ID_PREFIXES.field_option)),
          existing,
        })
        .catch(() => undefined);
    },
  });

  const takenKeys = existing.filter((row) => row.entity === entity).map((row) => row.key);

  return (
    <AdaptiveSheet open onOpenChange={(open) => !open && onClose()}>
      <AdaptiveSheetContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <AdaptiveSheetHeader>
            <AdaptiveSheetTitle>{field ? field.label : "New field"}</AdaptiveSheetTitle>
            <AdaptiveSheetDescription>
              {field ? `${names.title} · ${filled} filled` : names.title}
            </AdaptiveSheetDescription>
          </AdaptiveSheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <form.Field
                name="label"
                validators={{ onDynamic: ({ value }) => fieldLabelError(value) }}
              >
                {(input) => <TextField field={input} label="Label" placeholder="Runs on" />}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.label}>
                {(label) => (
                  <Field>
                    <div className="flex items-baseline justify-between gap-4">
                      <FieldLabel>Key</FieldLabel>
                      <code className="truncate font-mono text-muted-foreground text-xs select-text">
                        {field ? field.key : fieldKey(label, takenKeys)}
                      </code>
                    </div>
                    <FieldDescription>
                      What the API and your agents call it. Set from the label, fixed once saved —
                      renaming the label later never breaks a caller.
                    </FieldDescription>
                  </Field>
                )}
              </form.Subscribe>
              <FieldSeparator />
              <form.Field name="agentFilled">
                {(input) => (
                  <CheckField
                    description="They propose a value with a source, and never overwrite yours."
                    field={input}
                    label="Let your agents fill this"
                  />
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.agentFilled}>
                {(agentFilled) =>
                  agentFilled ? (
                    <form.Field
                      name="agentBrief"
                      validators={{ onDynamic: ({ value }) => fieldBriefError(value) }}
                    >
                      {(input) => (
                        <Field data-invalid={input.state.meta.errors.length > 0 || undefined}>
                          <FieldLabel htmlFor="field-brief">What counts as an answer</FieldLabel>
                          <Textarea
                            className="min-h-20"
                            id="field-brief"
                            onBlur={input.handleBlur}
                            onChange={(event) => input.handleChange(event.target.value)}
                            placeholder="Which cloud they run production on. Their docs or job ads say it outright — infer nothing from a logo."
                            value={input.state.value}
                          />
                          {input.state.meta.errors[0] ? (
                            <FieldError>{String(input.state.meta.errors[0])}</FieldError>
                          ) : (
                            <FieldDescription>
                              Leave it empty and your agents work from the label and type alone.
                            </FieldDescription>
                          )}
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
              <FieldSeparator />
              <form.Field name="type">
                {(input) => (
                  <Field>
                    <FieldLabel>Type</FieldLabel>
                    {field ? (
                      <p className="text-muted-foreground">
                        {fieldTypeLabel(field.type)} — fixed once created.
                      </p>
                    ) : (
                      <ChoiceDetail
                        field
                        label="Type"
                        onSave={(next) => next && isFieldType(next) && input.handleChange(next)}
                        options={TYPE_CHOICES}
                        value={input.state.value}
                      />
                    )}
                  </Field>
                )}
              </form.Field>
              {field?.type === "select" ? (
                <LiveOptions fieldId={field.id} options={options} workspaceId={workspaceId} />
              ) : null}
              {field ? null : (
                <form.Subscribe selector={(state) => state.values.type}>
                  {(type) =>
                    type === "select" ? (
                      <form.Field
                        mode="array"
                        name="options"
                        validators={{ onDynamic: ({ value }) => optionLabelsError(value) }}
                      >
                        {(list) => (
                          <Field>
                            <FieldLabel>Options</FieldLabel>
                            <div className="flex flex-col gap-2">
                              {list.state.value.map((_, index) => (
                                <form.Field
                                  // oxlint-disable-next-line react/no-array-index-key -- TanStack Form array fields are addressed by index.
                                  key={index}
                                  name={`options[${index}]`}
                                >
                                  {(option) => (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        aria-label={`Option ${index + 1}`}
                                        onBlur={option.handleBlur}
                                        onChange={(event) =>
                                          option.handleChange(event.target.value)
                                        }
                                        placeholder={`Option ${index + 1}`}
                                        value={option.state.value}
                                      />
                                      <Button
                                        aria-label={`Remove option ${index + 1}`}
                                        onClick={() => list.removeValue(index)}
                                        size="icon-sm"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <CloseIcon />
                                      </Button>
                                    </div>
                                  )}
                                </form.Field>
                              ))}
                            </div>
                            <Button
                              className="self-start"
                              onClick={() => list.pushValue("")}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <AddIcon />
                              Add option
                            </Button>
                            {list.state.meta.isTouched || form.state.submissionAttempts > 0
                              ? list.state.meta.errors[0] && (
                                  <FieldError>{String(list.state.meta.errors[0])}</FieldError>
                                )
                              : null}
                          </Field>
                        )}
                      </form.Field>
                    ) : null
                  }
                </form.Subscribe>
              )}
              <FieldSeparator />
              <form.Field name="showOnSheet">
                {(input) => <CheckField field={input} label={`Show on the ${names.one} sheet`} />}
              </form.Field>
              <form.Field name="showOnTable">
                {(input) => (
                  <CheckField
                    field={input}
                    label={`Offer as a column on the ${names.title} table`}
                  />
                )}
              </form.Field>
              <form.Field name="showOnFilter">
                {(input) => (
                  <CheckField
                    description="Select, member and checkbox fields."
                    field={input}
                    label={`Offer as a filter on the ${names.title} table`}
                  />
                )}
              </form.Field>
              <form.Field name="required">
                {(input) => (
                  <CheckField
                    description="Once set, it can be changed but not cleared."
                    field={input}
                    label="Required"
                  />
                )}
              </form.Field>
            </FieldGroup>
          </div>
          <AdaptiveSheetFooter>
            <div className="flex w-full justify-between gap-2">
              <div className="flex gap-2">
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(submitting) => (
                    <Button loading={submitting} type="submit">
                      {field ? "Save changes" : "Create field"}
                    </Button>
                  )}
                </form.Subscribe>
                <Button onClick={onClose} type="button" variant="outline">
                  Cancel
                </Button>
              </div>
              {field ? (
                <Button onClick={() => onArchive(field)} type="button" variant="ghost">
                  Archive
                </Button>
              ) : null}
            </div>
          </AdaptiveSheetFooter>
        </form>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}

/**
 * An existing select field's options: renaming saves when you leave the input, × archives the
 * option (values that use it keep it), and Add option adds one at the end.
 */
function LiveOptions({
  workspaceId,
  fieldId,
  options,
}: {
  workspaceId: string;
  fieldId: string;
  options: readonly FieldOption[];
}) {
  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      saveFieldOption(workspaceId, id, { label }),
    onError: (error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) =>
      saveFieldOption(workspaceId, id, { archived_at: new Date().toISOString() }),
    onError: (error) => toast.error(error.message),
  });

  const add = useMutation({
    mutationFn: (label: string) => addFieldOption(workspaceId, fieldId, label),
    onError: (error) => toast.error(error.message),
  });

  return (
    <Field>
      <FieldLabel>Options</FieldLabel>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <div className="flex items-center gap-2" key={option.id}>
            <Input
              aria-label={`Rename ${option.label}`}
              defaultValue={option.label}
              onBlur={(event) => {
                const label = normalizeOptionLabel(event.currentTarget.value);

                if (!label.ok) {
                  event.currentTarget.value = option.label;
                  toast.error(label.message);

                  return;
                }

                if (label.value !== option.label)
                  rename.mutate({ id: option.id, label: label.value });
              }}
            />
            <Button
              aria-label={`Archive ${option.label}`}
              onClick={() => archive.mutate(option.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <CloseIcon />
            </Button>
          </div>
        ))}
        <Input
          aria-label="Add option"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;

            event.preventDefault();

            const input = event.currentTarget;
            const label = normalizeOptionLabel(input.value);

            if (!label.ok) return;

            input.value = "";
            add.mutate(label.value);
          }}
          placeholder="Add option, then Enter"
        />
      </div>
    </Field>
  );
}
