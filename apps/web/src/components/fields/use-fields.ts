import type { FieldEntity } from "@crm/core/fields";
import { useLiveQuery } from "@tanstack/react-db";
import {
  type FieldDefinition,
  fieldDefinitionsCollection,
  type FieldOption,
  fieldOptionsCollection,
  type FieldValue,
  fieldValuesCollection,
} from "../../lib/fields.ts";

/**
 * Live reads of a workspace's custom fields. Each hook subscribes to its collection (which starts
 * its sync), so sheets, tables and settings read and filter locally.
 */

const byPosition = <R extends { position: number; label: string }>(rows: readonly R[]) =>
  rows.toSorted(
    (left, right) => left.position - right.position || left.label.localeCompare(right.label),
  );

export function useFieldDefinitions(workspaceId: string) {
  const { data = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ field: fieldDefinitionsCollection(workspaceId) }),
  });

  return { definitions: data, loading: isLoading };
}

export function useFieldOptions(workspaceId: string) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ option: fieldOptionsCollection(workspaceId) }),
  });

  return data;
}

export function useFieldValues(workspaceId: string) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ value: fieldValuesCollection(workspaceId) }),
  });

  return data;
}

export interface EntityFields {
  /** Live fields of the entity, in their order. */
  readonly fields: readonly FieldDefinition[];
  /** Archived fields, newest first: values kept, shown nowhere but settings. */
  readonly archived: readonly FieldDefinition[];
  /** Every definition of the workspace (for key and position rules). */
  readonly all: readonly FieldDefinition[];
  /** Each select field's live options, in order. */
  readonly options: ReadonlyMap<string, readonly FieldOption[]>;
  readonly loading: boolean;
}

/** One entity's fields and their options. */
export function useEntityFields(workspaceId: string, entity: FieldEntity): EntityFields {
  const { definitions, loading } = useFieldDefinitions(workspaceId);
  const optionRows = useFieldOptions(workspaceId);

  const own = definitions.filter((field) => field.entity === entity);
  const options = new Map<string, FieldOption[]>();

  for (const option of byPosition(optionRows)) {
    if (option.archived_at) continue;

    const list = options.get(option.field_id) ?? [];

    list.push(option);
    options.set(option.field_id, list);
  }

  return {
    fields: byPosition(own.filter((field) => !field.archived_at)),
    archived: own
      .filter((field) => field.archived_at !== null)
      .toSorted((left, right) => (right.archived_at ?? "").localeCompare(left.archived_at ?? "")),
    all: definitions,
    options,
    loading,
  };
}

/** Values by record, then by field: `values.get(recordId)?.get(fieldId)`. */
export function useValuesByRecord(workspaceId: string) {
  const rows = useFieldValues(workspaceId);
  const values = new Map<string, Map<string, FieldValue>>();

  for (const row of rows) {
    const record = values.get(row.record_id) ?? new Map<string, FieldValue>();

    record.set(row.field_id, row);
    values.set(row.record_id, record);
  }

  return values;
}
