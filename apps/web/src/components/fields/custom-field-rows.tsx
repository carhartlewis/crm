import settings16 from "@carbon/icons/es/settings/16.js";
import { type FieldEntity, type FieldInput, optionalNumber } from "@crm/core/fields";
import type { FieldKind } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { type FieldDefinition, type FieldValue, setFieldValue } from "../../lib/fields.ts";
import { calendarDate } from "../../lib/record-format.ts";
import {
  CheckboxDetail,
  ChoiceDetail,
  DateDetail,
  DetailRow,
  ProseDetail,
  TextDetail,
} from "../records/detail-fields.tsx";
import { MemberAvatar, MARK_SIZE } from "../records/record-visuals.tsx";
import { useMembers } from "../records/use-crm.ts";
import { useEntityFields, useValuesByRecord } from "./use-fields.ts";

const SettingsIcon = carbonIcon(settings16);

/** The kind `TextDetail` checks and types the input with, per one-line field type. */
function textKind(type: string): FieldKind {
  switch (type) {
    case "url":
      return "url";
    case "email":
      return "email";
    case "phone":
      return "phone";
    default:
      return "text";
  }
}

export interface CustomFieldRowsProps {
  readonly entity: FieldEntity;
  readonly recordId: string;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * A record's custom fields (those shown on the sheet), as rows after its standard details. Each
 * edit saves optimistically through the same rule the API applies.
 */
export function CustomFieldRows({ entity, recordId, userId, workspaceId }: CustomFieldRowsProps) {
  const { fields, options } = useEntityFields(workspaceId, entity);
  const values = useValuesByRecord(workspaceId).get(recordId);
  const { members } = useMembers(userId, workspaceId);

  const save = useMutation({
    mutationFn: (input: {
      field: FieldDefinition;
      current: FieldValue | undefined;
      value: FieldInput;
    }) => setFieldValue({ workspaceId, recordId, ...input }),
    onError: (error) => toast.error(error.message),
  });

  return fields
    .filter((field) => field.show_on_sheet)
    .map((field) => {
      const current = values?.get(field.id);
      const set = (value: FieldInput) => save.mutate({ field, current, value });

      return (
        <DetailRow key={field.id} label={field.label}>
          <FieldEditor
            field={field}
            current={current}
            options={(options.get(field.id) ?? []).map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            members={members.map((member) => ({
              value: member.id,
              label: member.name,
              mark: <MemberAvatar member={member} size={MARK_SIZE} />,
            }))}
            onSave={set}
          />
        </DetailRow>
      );
    });
}

interface Choice {
  readonly value: string;
  readonly label: string;
  readonly mark?: ReactNode;
}

function FieldEditor({
  field,
  current,
  options,
  members,
  onSave,
}: {
  field: FieldDefinition;
  current: FieldValue | undefined;
  options: readonly Choice[];
  members: readonly Choice[];
  onSave: (value: FieldInput) => void;
}) {
  const spec = { column: field.key, label: field.label, kind: textKind(field.type) };

  switch (field.type) {
    case "long_text":
      return (
        <ProseDetail
          onSave={onSave}
          placeholder={`Add ${field.label.toLowerCase()}`}
          spec={{ ...spec, kind: "prose" }}
          value={current?.text ?? null}
        />
      );
    case "date":
      return (
        <DateDetail
          display={calendarDate(current?.date ?? null)}
          label={field.label}
          onSave={onSave}
          value={current?.date ?? null}
        />
      );
    case "checkbox":
      return <CheckboxDetail label={field.label} onSave={onSave} value={current?.bool ?? null} />;
    case "select":
      return (
        <ChoiceDetail
          label={field.label}
          none={field.required ? undefined : "None"}
          onSave={onSave}
          options={options}
          value={current?.option_id ?? null}
        />
      );
    case "user":
      return (
        <ChoiceDetail
          label={field.label}
          none={field.required ? undefined : "Nobody"}
          onSave={onSave}
          options={members}
          value={current?.user_id ?? null}
        />
      );
    case "number":
      return (
        <TextDetail
          normalize={optionalNumber}
          onSave={onSave}
          spec={spec}
          value={current?.number ?? null}
        />
      );
    default:
      return <TextDetail onSave={onSave} spec={spec} value={current?.text ?? null} />;
  }
}

/** The Details header's gear: opens the entity's fields in Workspace settings. */
export function FieldsSettingsLink({ entity }: { entity: FieldEntity }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={400}
        render={
          <Button
            aria-label="Edit fields"
            nativeButton={false}
            render={<Link search={{ entity }} to="/settings/fields" />}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <SettingsIcon />
      </TooltipTrigger>
      <TooltipContent>Edit fields</TooltipContent>
    </Tooltip>
  );
}
