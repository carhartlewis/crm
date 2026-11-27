import {
  FIELD_DEFINITIONS_SYNC_PATH,
  FIELD_OPTIONS_SYNC_PATH,
  FIELD_VALUES_SYNC_PATH,
} from "@crm/core/api";
import {
  type FieldEntity,
  type FieldInput,
  type FieldType,
  fieldKey,
  normalizeFieldValue,
  valueColumns,
} from "@crm/core/fields";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection, createOptimisticAction } from "@tanstack/react-db";
import {
  checkedTxid,
  isoTimestamp,
  perWorkspace,
  syncedWrite,
  type WriteBody,
} from "./sync-collections.ts";

/**
 * Custom fields sync from Postgres through Electric (ADR 0012): definitions, select options and
 * values, one collection each per workspace. Every write goes through the API, which returns the
 * txid the collection awaits before it drops the optimistic change.
 */

/** A field definition as Electric syncs it. A type alias: TanStack DB rows need an index signature. */
export type FieldDefinition = {
  readonly id: string;
  readonly workspace_id: string;
  readonly entity: FieldEntity;
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly agent_filled: boolean;
  readonly agent_brief: string | null;
  readonly required: boolean;
  readonly show_on_sheet: boolean;
  readonly show_on_table: boolean;
  readonly show_on_filter: boolean;
  readonly position: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type FieldOption = {
  readonly id: string;
  readonly workspace_id: string;
  readonly field_id: string;
  readonly label: string;
  readonly position: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type FieldValue = {
  readonly id: string;
  readonly workspace_id: string;
  readonly field_id: string;
  readonly record_id: string;
  readonly text: string | null;
  /** Postgres `numeric`, as decimal text. */
  readonly number: string | null;
  /** `YYYY-MM-DD`. */
  readonly date: string | null;
  readonly bool: boolean | null;
  readonly option_id: string | null;
  readonly user_id: string | null;
  readonly set_by: string;
  readonly created_at: string;
  readonly updated_at: string;
};

const syncSource = (path: string, workspaceId: string) => ({
  url: new URL(path, window.location.origin).href,
  params: { workspace: workspaceId },
  parser: { timestamptz: isoTimestamp },
});

/** A fields endpoint's JSON body: flat values, id lists, and a new field's options. */
type FieldWriteBody = Readonly<
  Record<
    string,
    | string
    | boolean
    | null
    | undefined
    | readonly string[]
    | readonly { readonly id: string | undefined; readonly label: string }[]
  >
>;

/**
 * A write whose body has arrays (`syncedWrite` takes flat bodies): returns its txid, or throws
 * the API's message.
 */
async function writeJson(path: string, method: "POST" | "PUT", body: FieldWriteBody) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const result: { txid?: unknown; message?: unknown } = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = String(result.message ?? "");

    throw new Error(message === result.message ? message : "The change couldn't be saved");
  }

  return checkedTxid(Number(result.txid));
}

const fieldPath = (id: string) => `/api/fields/${encodeURIComponent(id)}`;

/** The PATCH body for a definition's changes: only what the API lets you change. */
function definitionPatch(changes: Partial<FieldDefinition>): WriteBody {
  return {
    label: changes.label,
    agent_filled: changes.agent_filled,
    agent_brief: changes.agent_brief,
    required: changes.required,
    show_on_sheet: changes.show_on_sheet,
    show_on_table: changes.show_on_table,
    show_on_filter: changes.show_on_filter,
    archived: changes.archived_at === undefined ? undefined : changes.archived_at !== null,
  };
}

/** The workspace's field definitions. Edits and archive are optimistic (`saveField`). */
export const fieldDefinitionsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<FieldDefinition>({
      id: `field-definitions:${workspaceId}`,
      getKey: (row) => row.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncSource(FIELD_DEFINITIONS_SYNC_PATH, workspaceId),
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            syncedWrite(fieldPath(original.id), "PATCH", definitionPatch(changes)),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

/** Options of the workspace's select fields. Renames and archive are optimistic. */
export const fieldOptionsCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<FieldOption>({
      id: `field-options:${workspaceId}`,
      getKey: (row) => row.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncSource(FIELD_OPTIONS_SYNC_PATH, workspaceId),
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            syncedWrite(
              `${fieldPath(original.field_id)}/options/${encodeURIComponent(original.id)}`,
              "PATCH",
              {
                label: changes.label,
                archived:
                  changes.archived_at === undefined ? undefined : changes.archived_at !== null,
              },
            ),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

/** A value write: `PUT /api/fields/values`, `value: null` clears it. */
const putValue = (
  row: Pick<FieldValue, "id" | "field_id" | "record_id">,
  value: string | boolean | null,
) =>
  syncedWrite("/api/fields/values", "PUT", {
    id: row.id,
    field_id: row.field_id,
    record_id: row.record_id,
    value,
  });

/** The one typed column a value row fills, as the API takes it. */
const storedValue = (row: FieldValue): string | boolean | null =>
  row.text ?? row.number ?? row.date ?? row.option_id ?? row.user_id ?? row.bool;

/** Custom field values of the workspace's records, keyed by id; writes are optimistic. */
export const fieldValuesCollection = perWorkspace((workspaceId: string) =>
  createCollection(
    electricCollectionOptions<FieldValue>({
      id: `field-values:${workspaceId}`,
      getKey: (row) => row.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: syncSource(FIELD_VALUES_SYNC_PATH, workspaceId),
      onInsert: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ modified }) => putValue(modified, storedValue(modified))),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ modified }) => putValue(modified, storedValue(modified))),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onDelete: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original }) => putValue(original, null)),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  ),
);

/**
 * Sets one field's value on a record: shows at once, settles once the server stored it and the
 * row came back through sync. Throws the API's message on a rejection (and rolls back).
 */
export async function setFieldValue(input: {
  readonly workspaceId: string;
  readonly field: FieldDefinition;
  readonly recordId: string;
  readonly current: FieldValue | undefined;
  readonly value: FieldInput;
}) {
  const normalized = normalizeFieldValue(input.field.type, input.value);

  if (!normalized.ok) throw new Error(normalized.message);

  const collection = fieldValuesCollection(input.workspaceId);
  const stored = normalized.value;

  if (stored === null) {
    if (input.current) await collection.delete(input.current.id).when("settled");

    return;
  }

  const columns = valueColumns(stored);

  if (input.current) {
    await collection
      .update(input.current.id, (draft) => {
        Object.assign(draft, columns, { set_by: "member" });
      })
      .when("settled");

    return;
  }

  const now = new Date().toISOString();

  await collection
    .insert({
      id: createId(ID_PREFIXES.field_value),
      workspace_id: input.workspaceId,
      field_id: input.field.id,
      record_id: input.recordId,
      ...columns,
      set_by: "member",
      created_at: now,
      updated_at: now,
    })
    .when("settled");
}

/** Saves some of a definition's settings optimistically (label, flags, archive). */
export async function saveField(
  workspaceId: string,
  id: string,
  patch: Partial<
    Pick<
      FieldDefinition,
      | "label"
      | "agent_filled"
      | "agent_brief"
      | "required"
      | "show_on_sheet"
      | "show_on_table"
      | "show_on_filter"
      | "archived_at"
    >
  >,
) {
  await fieldDefinitionsCollection(workspaceId)
    .update(id, (draft) => {
      Object.assign(draft, patch);
    })
    .when("settled");
}

export interface NewFieldInput {
  readonly entity: FieldEntity;
  readonly label: string;
  readonly type: FieldType;
  readonly agentFilled: boolean;
  readonly agentBrief: string | null;
  readonly required: boolean;
  readonly showOnSheet: boolean;
  readonly showOnTable: boolean;
  readonly showOnFilter: boolean;
  readonly options: readonly string[];
}

/**
 * Creates a field and its options: they show at once (key and position as the API will make
 * them) and settle when the created rows sync back.
 */
export function createField(workspaceId: string) {
  const definitions = fieldDefinitionsCollection(workspaceId);
  const options = fieldOptionsCollection(workspaceId);

  return createOptimisticAction<{
    readonly id: string;
    readonly input: NewFieldInput;
    readonly optionIds: readonly string[];
    readonly existing: readonly FieldDefinition[];
  }>({
    onMutate: ({ id, input, optionIds, existing }) => {
      const now = new Date().toISOString();
      const siblings = existing.filter((field) => field.entity === input.entity);

      definitions.insert({
        id,
        workspace_id: workspaceId,
        entity: input.entity,
        key: fieldKey(
          input.label,
          siblings.map((field) => field.key),
        ),
        label: input.label,
        type: input.type,
        agent_filled: input.agentFilled,
        agent_brief: input.agentBrief,
        required: input.required,
        show_on_sheet: input.showOnSheet,
        show_on_table: input.showOnTable,
        show_on_filter: input.showOnFilter,
        position: siblings.reduce((max, field) => Math.max(max, field.position + 1), 0),
        archived_at: null,
        created_at: now,
        updated_at: now,
      });

      for (const [position, label] of input.options.entries()) {
        options.insert({
          id: optionIds[position] ?? createId(ID_PREFIXES.field_option),
          workspace_id: workspaceId,
          field_id: id,
          label,
          position,
          archived_at: null,
          created_at: now,
          updated_at: now,
        });
      }
    },
    mutationFn: async ({ id, input, optionIds }) => {
      const txid = await writeJson("/api/fields", "POST", {
        id,
        entity: input.entity,
        label: input.label,
        type: input.type,
        agent_filled: input.agentFilled,
        agent_brief: input.agentBrief,
        required: input.required,
        show_on_sheet: input.showOnSheet,
        show_on_table: input.showOnTable,
        show_on_filter: input.showOnFilter,
        options: input.options.map((label, index) => ({ id: optionIds[index], label })),
      });

      await Promise.all([definitions.utils.awaitTxId(txid), options.utils.awaitTxId(txid)]);
    },
  });
}

/** Moves an entity's fields into `ids` order at once; settles when the order syncs back. */
export function reorderFields(workspaceId: string) {
  const definitions = fieldDefinitionsCollection(workspaceId);

  return createOptimisticAction<{ readonly entity: FieldEntity; readonly ids: readonly string[] }>({
    onMutate: ({ ids }) => {
      definitions.update([...ids], (drafts) => {
        for (const draft of drafts) draft.position = ids.indexOf(draft.id);
      });
    },
    mutationFn: async ({ entity, ids }) => {
      const txid = await writeJson("/api/fields/order", "PUT", { entity, ids });

      await definitions.utils.awaitTxId(txid);
    },
  });
}

/** Adds an option to a select field; it shows when the server's row syncs. */
export async function addFieldOption(workspaceId: string, fieldId: string, label: string) {
  const { txid } = await syncedWrite(`${fieldPath(fieldId)}/options`, "POST", {
    id: createId(ID_PREFIXES.field_option),
    label,
  });

  await fieldOptionsCollection(workspaceId).utils.awaitTxId(txid);
}

/** Renames or archives an option, optimistically. */
export async function saveFieldOption(
  workspaceId: string,
  id: string,
  patch: Partial<Pick<FieldOption, "label" | "archived_at">>,
) {
  await fieldOptionsCollection(workspaceId)
    .update(id, (draft) => {
      Object.assign(draft, patch);
    })
    .when("settled");
}

/** Sets a select field's option order. */
export async function reorderFieldOptions(
  workspaceId: string,
  fieldId: string,
  ids: readonly string[],
) {
  const txid = await writeJson(`${fieldPath(fieldId)}/options/order`, "PUT", { ids });

  await fieldOptionsCollection(workspaceId).utils.awaitTxId(txid);
}
