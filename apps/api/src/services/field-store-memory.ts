import type { FieldEntity } from "@crm/core/fields";
import type {
  FieldDefinitionRow,
  FieldOptionRow,
  FieldStore,
  FieldTx,
  FieldValueRow,
} from "./field-store.ts";

interface Tables {
  definitions: Map<string, FieldDefinitionRow>;
  options: Map<string, FieldOptionRow>;
  values: Map<string, FieldValueRow>;
}

/** The row when it belongs to the workspace, else `null`. */
const scoped = <R extends { workspaceId: string }>(row: R | undefined, workspaceId: string) =>
  row && row.workspaceId === workspaceId ? row : null;

const copy = (tables: Tables): Tables => ({
  definitions: new Map(tables.definitions),
  options: new Map(tables.options),
  values: new Map(tables.values),
});

/**
 * In-memory `FieldStore` for tests: members are `workspaceId:userId` pairs, records are
 * `entity:workspaceId:id` triples, txids count up, and a transaction that throws leaves the rows
 * unchanged.
 */
export function createMemoryFieldStore(options: {
  readonly members: Iterable<string>;
  readonly records?: Iterable<string>;
}) {
  const members = new Set(options.members);
  const records = new Set(options.records ?? []);
  let tables: Tables = { definitions: new Map(), options: new Map(), values: new Map() };
  let txid = 2000;

  const txOn = (draft: Tables): FieldTx => {
    return {
      isMember: async (workspaceId, userId) => members.has(`${workspaceId}:${userId}`),
      recordExists: async (entity: FieldEntity, workspaceId, id) =>
        records.has(`${entity}:${workspaceId}:${id}`),
      idTaken: async (table, id) =>
        (table === "definition"
          ? draft.definitions
          : table === "option"
            ? draft.options
            : draft.values
        ).has(id),
      definition: async (workspaceId, id) => scoped(draft.definitions.get(id), workspaceId),
      definitions: async (workspaceId, entity) =>
        [...draft.definitions.values()].filter(
          (row) => row.workspaceId === workspaceId && row.entity === entity,
        ),
      insertDefinition: async (row) => {
        draft.definitions.set(row.id, row);
      },
      updateDefinition: async (workspaceId, id, patch) => {
        const row = scoped(draft.definitions.get(id), workspaceId);

        if (!row) return false;

        draft.definitions.set(id, { ...row, ...patch });

        return true;
      },
      option: async (workspaceId, id) => scoped(draft.options.get(id), workspaceId),
      options: async (workspaceId, fieldId) =>
        [...draft.options.values()].filter(
          (row) => row.workspaceId === workspaceId && row.fieldId === fieldId,
        ),
      insertOption: async (row) => {
        draft.options.set(row.id, row);
      },
      updateOption: async (workspaceId, id, patch) => {
        const row = scoped(draft.options.get(id), workspaceId);

        if (!row) return false;

        draft.options.set(id, { ...row, ...patch });

        return true;
      },
      value: async (workspaceId, fieldId, recordId) =>
        [...draft.values.values()].find(
          (row) =>
            row.workspaceId === workspaceId && row.fieldId === fieldId && row.recordId === recordId,
        ) ?? null,
      insertValue: async (row) => {
        draft.values.set(row.id, row);
      },
      updateValue: async (workspaceId, id, patch) => {
        const row = scoped(draft.values.get(id), workspaceId);

        if (row) draft.values.set(id, { ...row, ...patch });
      },
      removeValue: async (workspaceId, id) => {
        if (scoped(draft.values.get(id), workspaceId)) draft.values.delete(id);
      },
    };
  };

  const store: FieldStore = {
    transact: async (fn) => {
      const draft = copy(tables);
      const result = await fn(txOn(draft));

      tables = draft;
      txid += 1;

      return { result, txid };
    },
    read: (fn) => fn(txOn(copy(tables))),
  };

  return {
    store,
    definitions: () => tables.definitions,
    options: () => tables.options,
    values: () => tables.values,
    addRecord: (entity: FieldEntity, workspaceId: string, id: string) => {
      records.add(`${entity}:${workspaceId}:${id}`);
    },
  };
}
