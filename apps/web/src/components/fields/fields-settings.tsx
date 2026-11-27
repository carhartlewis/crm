import add16 from "@carbon/icons/es/add/16.js";
import chevronRight16 from "@carbon/icons/es/chevron--right/16.js";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@crm/ui/components/empty";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import { createField, type FieldDefinition, reorderFields, saveField } from "../../lib/fields.ts";
import { haptic } from "../../lib/haptics.ts";
import { moveItem } from "../../lib/pinned-order.ts";
import { SettingsPage } from "../settings/settings-page.tsx";
import { reorderable } from "../shell/reorder.ts";
import { FieldSheet } from "./field-sheet.tsx";
import { useEntityFields, useFieldValues } from "./use-fields.ts";

const AddIcon = carbonIcon(add16);
const ChevronIcon = carbonIcon(chevronRight16);
const DocumentIcon = carbonIcon(document16);
const DragIcon = carbonIcon(draggable16);
const MoreIcon = carbonIcon(overflow16);

export interface FieldsSettingsProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly entity: FieldEntity;
  readonly onEntity: (entity: FieldEntity) => void;
}

/** A group header row that opens and closes its list: label, then a count and a note. */
function GroupToggle({ label, note }: { label: string; note: string }) {
  return (
    <div className="border-b py-3">
      <CollapsibleTrigger className="group/toggle flex w-full items-center text-left">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/toggle:rotate-90" />
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <span className="shrink-0 text-muted-foreground">{note}</span>
        </span>
      </CollapsibleTrigger>
    </div>
  );
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

  return (
    <SettingsPage actions={actions} title="Fields">
      <div className="flex flex-col gap-4">
        <Tabs onValueChange={(next: FieldEntity) => onEntity(next)} value={entity}>
          <TabsList aria-label="Record kind">
            {FIELD_ENTITIES.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {ENTITY_NAMES[kind].title}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-muted-foreground text-pretty">
          This shapes every {names.one} in your CRM. Order here is the order on the sheet.
        </p>
      </div>

      <div className="flex flex-col">
        <Collapsible>
          <GroupToggle
            label="Standard fields"
            note={`${STANDARD_FIELDS[entity].length} · built in`}
          />
          <CollapsibleContent>
            <ul className="flex flex-col border-b py-2">
              {STANDARD_FIELDS[entity].map((label) => (
                <li className="truncate py-1.5 pl-6 text-muted-foreground" key={label}>
                  {label}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {suggested.length > 0 ? (
          <Collapsible defaultOpen={fields.length === 0}>
            <GroupToggle label="Suggested fields" note={`${suggested.length} · one click to add`} />
            <CollapsibleContent>
              <ul className="flex flex-col border-b py-1">
                {suggested.map((template) => (
                  <li className="flex min-w-0 items-center gap-3 py-1.5 pl-6" key={template.label}>
                    <span className="min-w-0 flex-1 truncate">{template.label}</span>
                    <TypeBadge>{fieldTypeLabel(template.type)}</TypeBadge>
                    <Button
                      disabled={create.isPending}
                      onClick={() => create.mutate(template)}
                      size="xs"
                      variant="outline"
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {fields.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DocumentIcon />
              </EmptyMedia>
              <EmptyTitle>No custom fields yet</EmptyTitle>
              <EmptyDescription>
                Create dynamic fields that your agents can research and pre-fill.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => void setEditing("new")}>
                <AddIcon />
                New field
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <section aria-label="Custom fields" className="flex flex-col">
            <div className="flex items-center justify-between border-b py-3 text-muted-foreground text-xs uppercase tracking-wide select-none">
              <span>Custom fields</span>
              <span className="normal-case tracking-normal">Drag to order</span>
            </div>
            <div className="flex flex-col" ref={listRef}>
              {fields.map((field, index) => (
                <div
                  className="group/row flex min-w-0 items-center gap-2 border-b bg-background py-2"
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
                    onKeyDown={(event) => {
                      if (!event.altKey) return;

                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        move(index, index - 1);
                      }

                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        move(index, index + 1);
                      }
                    }}
                    type="button"
                  >
                    <span className="w-full truncate">{field.label}</span>
                    <span className="w-full truncate text-muted-foreground">
                      {fieldNote(field, names.title)}
                    </span>
                  </button>
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
                      <DropdownMenuItem onClick={() => void setEditing(field.id)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      >
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
          </section>
        )}

        {archived.length > 0 ? (
          <Collapsible>
            <GroupToggle
              label="Archived"
              note={`${archived.length} · values kept, hidden everywhere`}
            />
            <CollapsibleContent>
              <ul className="flex flex-col border-b py-1">
                {archived.map((field) => (
                  <li className="flex min-w-0 items-center gap-3 py-1.5 pl-6" key={field.id}>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {field.label}
                    </span>
                    <TypeBadge>{fieldTypeLabel(field.type)}</TypeBadge>
                    <Button
                      onClick={() => archive.mutate({ id: field.id, archived: false })}
                      size="xs"
                      variant="outline"
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

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

/** A field type in a small mono chip, as the design shows it. */
function TypeBadge({ children }: { children: ReactNode }) {
  return (
    <Badge className="shrink-0" variant="secondary">
      {children}
    </Badge>
  );
}
