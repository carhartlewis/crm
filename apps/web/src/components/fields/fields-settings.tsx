import add16 from "@carbon/icons/es/add/16.js";
import document16 from "@carbon/icons/es/document/16.js";
import draggable16 from "@carbon/icons/es/draggable/16.js";
import overflow16 from "@carbon/icons/es/overflow-menu--vertical/16.js";
import {
  ENTITY_NAMES,
  FIELD_ENTITIES,
  type FieldEntity,
  fieldKey,
  fieldTypeLabel,
  STANDARD_FIELDS,
  SUGGESTED_FIELDS,
  type SuggestedField,
} from "@crm/core/fields";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { type KeyboardEvent, type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  createField,
  type FieldDefinition,
  fillFieldMutation,
  reorderFields,
  saveField,
} from "../../lib/fields.ts";
import { haptic } from "../../lib/haptics.ts";
import { moveItem } from "../../lib/pinned-order.ts";
import { useCompanies, useContacts, useDeals } from "../records/use-crm.ts";
import { SettingsCard } from "../settings/settings-card.tsx";
import { SettingsPage } from "../settings/settings-page.tsx";
import { reorderable } from "../shell/reorder.ts";
import { FieldSheet } from "./field-sheet.tsx";
import { useEntityFields, useFieldValues } from "./use-fields.ts";

const AddIcon = carbonIcon(add16);
const DocumentIcon = carbonIcon(document16);
const DragIcon = carbonIcon(draggable16);
const MoreIcon = carbonIcon(overflow16);

export interface FieldsSettingsProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly entity: FieldEntity;
  readonly onEntity: (entity: FieldEntity) => void;
}

/** What a custom field's second line says: its brief, or how it is filled and where it shows. */
function fieldNote(field: FieldDefinition, entityTitle: string) {
  const parts = [
    field.agent_filled ? (field.agent_brief ?? "Your agents can fill it") : "Manual only",
    field.show_on_table ? `also a column on ${entityTitle}` : null,
    field.show_on_filter ? "also a filter" : null,
    field.required ? "required" : null,
  ];

  return parts.filter(Boolean).join(" · ");
}

/**
 * Workspace settings → Fields: one tab per record kind. Standard fields are listed, suggested ones
 * add with one click, custom ones drag (or ⋯ Move up/down) into the order the sheet shows, and
 * archived ones keep their values until restored. New and Edit open a side sheet (`?field=`).
 */
export function FieldsSettings({ workspaceId, entity, onEntity }: FieldsSettingsProps) {
  const names = ENTITY_NAMES[entity];
  const { fields, archived, all, options } = useEntityFields(workspaceId, entity);
  const values = useFieldValues(workspaceId);
  const [editing, setEditing] = useQueryState("field", parseAsString);
  const [archiving, setArchiving] = useState<FieldDefinition | null>(null);

  const recordCount = useRecordCount(workspaceId, entity);

  const filledCount = (fieldId: string) => values.filter((row) => row.field_id === fieldId).length;

  const create = useMutation({
    mutationFn: async (template: SuggestedField) => {
      const labels = "options" in template ? [...(template.options ?? [])] : [];

      await createField(workspaceId)({
        id: createId(ID_PREFIXES.field_definition),
        input: {
          entity,
          label: template.label,
          type: template.type,
          agentFilled: true,
          agentBrief: template.brief ?? null,
          required: false,
          showOnSheet: true,
          showOnTable: false,
          showOnFilter: template.type === "select",
          options: labels,
        },
        optionIds: labels.map(() => createId(ID_PREFIXES.field_option)),
        existing: all,
      }).when("settled");
    },
    onSuccess: (_, template) => toast.success(`${template.label} added`),
    onError: (error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: ({ id, archived: on }: { id: string; archived: boolean }) =>
      saveField(workspaceId, id, { archived_at: on ? new Date().toISOString() : null }),
    onError: (error) => toast.error(error.message),
  });

  const fill = useMutation({
    ...fillFieldMutation,
    onSuccess: (queued) =>
      queued
        ? toast.success("Your agents are filling the rest. Values appear as they find them.")
        : toast.error("Your agents are busy with research. Try again in a few minutes."),
    onError: (error) => toast.error(error.message),
  });

  const reorder = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      await reorderFields(workspaceId)({ entity, ids }).when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= fields.length || from === to) return;

    reorder.mutate(
      moveItem(
        fields.map((field) => field.id),
        from,
        to,
      ),
    );
  };

  // The order is read from the list itself on drop, so the callback never holds stale rows.
  const listRef = useCallback(
    (list: HTMLDivElement | null) =>
      reorderable({
        onSlotChange: haptic,
        onCommit: (from, to) => {
          const ids = [
            ...(list?.querySelectorAll<HTMLElement>(":scope > [data-reorder-item]") ?? []),
          ].map((item) => item.dataset["fieldId"] ?? "");

          reorderFields(workspaceId)({ entity, ids: moveItem(ids, from, to) })
            .when("settled")
            .catch((error: Error) => toast.error(error.message));
        },
      })(list),
    [entity, workspaceId],
  );

  const taken = new Set(
    all.flatMap((field) => (field.entity === entity ? [field.key, field.label.toLowerCase()] : [])),
  );

  const suggested = SUGGESTED_FIELDS[entity].filter(
    (template: SuggestedField) =>
      !taken.has(fieldKey(template.label)) && !taken.has(template.label.toLowerCase()),
  );

  const editingField =
    editing && editing !== "new" ? (all.find((field) => field.id === editing) ?? null) : null;

  const actions = (
    <Button onClick={() => void setEditing("new")} size="sm">
      <AddIcon />
      New field
    </Button>
  );

  const rowKeys = (index: number) => (event: KeyboardEvent) => {
    if (!event.altKey) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(index, index - 1);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <SettingsPage actions={actions} title="Fields">
      <Tabs onValueChange={(next: FieldEntity) => onEntity(next)} value={entity}>
        <TabsList aria-label="Record kind">
          {FIELD_ENTITIES.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {ENTITY_NAMES[kind].title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SettingsCard
        description={`Shown on every ${names.one}'s sheet in this order. Drag to reorder.`}
        headerAction={
          fields.length > 0 ? (
            <Button onClick={() => void setEditing("new")} size="sm" variant="outline">
              <AddIcon />
              New field
            </Button>
          ) : undefined
        }
        title="Custom fields"
      >
        {fields.length === 0 ? (
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-dashed px-3 py-3">
            <DocumentIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              No custom fields yet. Your agents research and fill the ones you add.
            </span>
            <Button onClick={() => void setEditing("new")} size="sm" variant="outline">
              <AddIcon />
              New field
            </Button>
          </div>
        ) : (
          <div className="-my-2 flex flex-col" ref={listRef}>
            {fields.map((field, index) => (
              <div
                className="group/row flex min-w-0 items-center gap-3 border-b bg-card py-2 last:border-b-0"
                data-field-id={field.id}
                data-reorder-item
                key={field.id}
              >
                <DragIcon
                  aria-hidden
                  className="size-4 shrink-0 cursor-grab text-muted-foreground"
                />
                <button
                  className="flex min-w-0 flex-1 flex-col items-start text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => void setEditing(field.id)}
                  onKeyDown={rowKeys(index)}
                  type="button"
                >
                  <span className="w-full truncate">{field.label}</span>
                  <span className="w-full truncate text-muted-foreground">
                    {fieldNote(field, names.title)}
                  </span>
                </button>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {`${filledCount(field.id)} of ${recordCount} filled`}
                </span>
                <TypeBadge>{fieldTypeLabel(field.type)}</TypeBadge>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label={`Actions for ${field.label}`}
                        size="icon-sm"
                        variant="ghost"
                      />
                    }
                  >
                    <MoreIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {field.agent_filled && filledCount(field.id) < recordCount ? (
                      <DropdownMenuItem
                        disabled={fill.isPending}
                        onClick={() => fill.mutate(field.id)}
                      >
                        Fill the rest
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => void setEditing(field.id)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onClick={() => move(index, index - 1)}>
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setArchiving(field)} variant="destructive">
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {suggested.length > 0 ? (
        <SettingsCard description="Common fields, ready for your agents to fill." title="Suggested">
          <ul className="-my-2 flex flex-col">
            {suggested.map((template) => (
              <li
                className="flex min-w-0 items-center gap-3 border-b py-2 last:border-b-0"
                key={template.label}
              >
                <span className="min-w-0 flex-1 truncate">{template.label}</span>
                <TypeBadge>{fieldTypeLabel(template.type)}</TypeBadge>
                <Button
                  disabled={create.isPending}
                  onClick={() => create.mutate(template)}
                  size="sm"
                  variant="outline"
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      <SettingsCard description={`Every ${names.one} has these.`} title="Standard fields">
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_FIELDS[entity].map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </SettingsCard>

      {archived.length > 0 ? (
        <SettingsCard description="Hidden everywhere. Their values are kept." title="Archived">
          <ul className="-my-2 flex flex-col">
            {archived.map((field) => (
              <li
                className="flex min-w-0 items-center gap-3 border-b py-2 last:border-b-0"
                key={field.id}
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{field.label}</span>
                <TypeBadge>{fieldTypeLabel(field.type)}</TypeBadge>
                <Button
                  onClick={() => archive.mutate({ id: field.id, archived: false })}
                  size="sm"
                  variant="outline"
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      {editing ? (
        <FieldSheet
          entity={editingField?.entity ?? entity}
          existing={all}
          field={editingField}
          filled={editingField ? filledCount(editingField.id) : 0}
          key={editing}
          onArchive={setArchiving}
          onClose={() => void setEditing(null)}
          options={editingField ? (options.get(editingField.id) ?? []) : []}
          workspaceId={workspaceId}
        />
      ) : null}

      <Dialog onOpenChange={(open) => !open && setArchiving(null)} open={archiving !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{archiving ? `Archive ${archiving.label}?` : ""}</DialogTitle>
            <DialogDescription>
              {archiving
                ? `Hidden everywhere. Its ${filledCount(archiving.id)} values are kept.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setArchiving(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (archiving) archive.mutate({ id: archiving.id, archived: true });

                setArchiving(null);
                void setEditing(null);
              }}
              type="button"
              variant="destructive"
            >
              Archive field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

/** How many live (unarchived) records of the kind the workspace has: the M of "N of M filled". */
function useRecordCount(workspaceId: string, entity: FieldEntity) {
  const { companies } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const { deals } = useDeals(workspaceId);
  const rows = entity === "company" ? companies : entity === "contact" ? contacts : deals;

  return rows.filter((row) => !row.archived_at).length;
}

/** A field type in a small mono chip, as the design shows it. */
function TypeBadge({ children }: { children: ReactNode }) {
  return (
    <Badge className="shrink-0" variant="secondary">
      {children}
    </Badge>
  );
}
