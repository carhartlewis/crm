import add16 from "@carbon/icons/es/add/16.js";
import close16 from "@carbon/icons/es/close/16.js";
import draggable16 from "@carbon/icons/es/draggable/16.js";
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
import { Switch } from "@crm/ui/components/switch";
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
import { type KeyboardEvent, useCallback } from "react";
import { toast } from "sonner";
import {
  addFieldOption,
  createField,
  type FieldDefinition,
  type FieldOption,
  reorderFieldOptions,
  saveField,
  saveFieldOption,
} from "../../lib/fields.ts";
import { haptic } from "../../lib/haptics.ts";
import { moveItem } from "../../lib/pinned-order.ts";
import { ChoiceDetail } from "../records/detail-fields.tsx";
import { useCompanies, useContacts, useDeals } from "../records/use-crm.ts";
import { reorderable } from "../shell/reorder.ts";
import { TextField } from "../text-field.tsx";

const AddIcon = carbonIcon(add16);
const CloseIcon = carbonIcon(close16);
const DragIcon = carbonIcon(draggable16);

/** Option rows drag by their grip only, so selecting an option's text never moves it. */
const HANDLE = "[data-reorder-handle]";

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

/** A setting that is on or off, on one line: the label on the left, the switch on the right. */
function SwitchField({ field, label }: { field: AnyFieldApi; label: string }) {
  const id = `field-${field.name}`;

  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Switch
        checked={field.state.value === true}
        id={id}
        onCheckedChange={(checked: boolean) => field.handleChange(checked)}
      />
    </Field>
  );
}

/** The grip that drags an option row. Pointer only; the keyboard moves rows with ⌥↑ and ⌥↓. */
function DragHandle() {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground select-none active:cursor-grabbing"
      data-reorder-handle
    >
      <DragIcon className="size-4" />
    </span>
  );
}

/** ⌥↑ and ⌥↓ move an option row one place. */
function altArrowMove(
  event: KeyboardEvent,
  index: number,
  move: (from: number, to: number) => void,
) {
  if (!event.altKey) return;

  let step = 0;

  if (event.key === "ArrowUp") step = -1;

  if (event.key === "ArrowDown") step = 1;

  if (step === 0) return;

  event.preventDefault();
  move(index, index + step);
}

/** Records whose value is not archived, of the rows a synced collection holds. */
const liveCount = (rows: readonly { readonly archived_at: string | null }[]) =>
  rows.filter((row) => row.archived_at === null).length;

const coverage = (filled: number, total: number, loading: boolean) =>
  loading ? `${filled} filled` : `${filled} of ${total} filled`;

interface CoverageProps {
  readonly workspaceId: string;
  readonly filled: number;
}

function CompanyCoverage({ workspaceId, filled }: CoverageProps) {
  const { companies, loading } = useCompanies(workspaceId);

  return coverage(filled, liveCount(companies), loading);
}

function ContactCoverage({ workspaceId, filled }: CoverageProps) {
  const { contacts, loading } = useContacts(workspaceId);

  return coverage(filled, liveCount(contacts), loading);
}

function DealCoverage({ workspaceId, filled }: CoverageProps) {
  const { deals, loading } = useDeals(workspaceId);

  return coverage(filled, liveCount(deals), loading);
}

/** "N of M filled", where M counts the entity's records; subscribes to that one collection only. */
function Coverage({ entity, ...props }: CoverageProps & { readonly entity: FieldEntity }) {
  if (entity === "company") return <CompanyCoverage {...props} />;

  if (entity === "contact") return <ContactCoverage {...props} />;

  return <DealCoverage {...props} />;
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

  // A new field's options reorder in the form; the order is read on submit.
  const draftListRef = useCallback(
    (list: HTMLDivElement | null) =>
      reorderable({
        handle: HANDLE,
        onSlotChange: haptic,
        onCommit: (from, to) => form.moveFieldValues("options", from, to),
      })(list),
    [form],
  );

  const moveDraft = (from: number, to: number, list: Element | null) => {
    if (to < 0 || to >= form.getFieldValue("options").length) return;

    form.moveFieldValues("options", from, to);
    // Rows are keyed by index, so the focus follows the moved value to its new row.
    requestAnimationFrame(() => list?.querySelectorAll("input")[to]?.focus());
  };

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
              {names.title}
              {field ? (
                <>
                  {" · "}
                  <Coverage entity={entity} filled={filled} workspaceId={workspaceId} />
                </>
              ) : null}
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
                            <div
                              className="flex flex-col gap-2"
                              data-reorder-list
                              ref={draftListRef}
                            >
                              {list.state.value.map((_, index) => (
                                <form.Field
                                  // oxlint-disable-next-line react/no-array-index-key -- TanStack Form array fields are addressed by index.
                                  key={index}
                                  name={`options[${index}]`}
                                >
                                  {(option) => (
                                    <div
                                      className="flex items-center gap-1 bg-background"
                                      data-reorder-item
                                    >
                                      <DragHandle />
                                      <Input
                                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                        aria-label={`Option ${index + 1}`}
                                        onBlur={option.handleBlur}
                                        onChange={(event) =>
                                          option.handleChange(event.target.value)
                                        }
                                        onKeyDown={(event) =>
                                          altArrowMove(event, index, (from, to) =>
                                            moveDraft(
                                              from,
                                              to,
                                              event.currentTarget.closest("[data-reorder-list]"),
                                            ),
                                          )
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
              <div className="flex flex-col gap-3">
                <form.Field name="agentFilled">
                  {(input) => <SwitchField field={input} label="Let your agents fill this" />}
                </form.Field>
                <form.Field name="showOnSheet">
                  {(input) => (
                    <SwitchField field={input} label={`Show on the ${names.one} sheet`} />
                  )}
                </form.Field>
                <form.Field name="showOnTable">
                  {(input) => (
                    <SwitchField
                      field={input}
                      label={`Offer as a column on the ${names.title} table`}
                    />
                  )}
                </form.Field>
                <form.Field name="showOnFilter">
                  {(input) => (
                    <SwitchField
                      field={input}
                      label={`Offer as a filter on the ${names.title} table`}
                    />
                  )}
                </form.Field>
                <form.Field name="required">
                  {(input) => <SwitchField field={input} label="Required" />}
                </form.Field>
              </div>
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
                              Your agents fill it from sources and keep your own values. Leave this
                              empty and they work from the label and type alone.
                            </FieldDescription>
                          )}
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
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
 * Keeps the focus on a moved row's input. React may move that node to reorder the list, which
 * blurs it; for a few frames, the input takes the focus back unless something else has it.
 */
function keepFocus(node: HTMLElement) {
  let frames = 0;

  const tick = () => {
    const active = document.activeElement;

    if (node.isConnected && (active === null || active === document.body)) node.focus();

    frames += 1;

    if (frames < 10) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

/**
 * An existing select field's options: renaming saves when you leave the input, × archives the
 * option (values that use it keep it), Add option adds one at the end, and the grip or ⌥↑ ⌥↓
 * reorders them. While a reorder saves, the list shows the new order from the mutation.
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

  const reorder = useMutation({
    mutationFn: (ids: readonly string[]) => reorderFieldOptions(workspaceId, fieldId, ids),
    onError: (error) => toast.error(error.message),
  });

  const pending = reorder.isPending ? reorder.variables : undefined;

  const rank = (id: string) => {
    const index = pending?.indexOf(id) ?? -1;

    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };

  const shown = pending ? options.toSorted((a, b) => rank(a.id) - rank(b.id)) : options;

  const { mutate } = reorder;

  // The order is read from the list itself on drop, so the callback never holds stale rows.
  const listRef = useCallback(
    (list: HTMLDivElement | null) =>
      reorderable({
        handle: HANDLE,
        onSlotChange: haptic,
        onCommit: (from, to) => {
          const ids = [
            ...(list?.querySelectorAll<HTMLElement>(":scope > [data-reorder-item]") ?? []),
          ].map((item) => item.dataset["optionId"] ?? "");

          mutate(moveItem(ids, from, to));
        },
      })(list),
    [mutate],
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= shown.length) return;

    mutate(
      moveItem(
        shown.map((option) => option.id),
        from,
        to,
      ),
    );
  };

  return (
    <Field>
      <FieldLabel>Options</FieldLabel>
      <div className="flex flex-col gap-2" ref={listRef}>
        {shown.map((option, index) => (
          <div
            className="flex items-center gap-1 bg-background"
            data-option-id={option.id}
            data-reorder-item
            key={option.id}
          >
            <DragHandle />
            <Input
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
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
              onKeyDown={(event) => {
                const input = event.currentTarget;

                altArrowMove(event, index, (from, to) => {
                  move(from, to);
                  keepFocus(input);
                });
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
