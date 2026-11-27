import type { Db } from "@crm/core/db";
import type { FieldEntity } from "@crm/core/fields";
import { type DbTx, transactWithTxid } from "./txid.ts";

/** A field definition as the ORM names its fields. */
export interface FieldDefinitionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly entity: string;
  readonly key: string;
  readonly label: string;
  readonly type: string;
  readonly agentFilled: boolean;
  readonly agentBrief: string | null;
  readonly required: boolean;
  readonly showOnSheet: boolean;
  readonly showOnTable: boolean;
  readonly showOnFilter: boolean;
  readonly position: number;
  readonly archivedAt: Date | null;
}

export interface FieldOptionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly fieldId: string;
  readonly label: string;
  readonly position: number;
  readonly archivedAt: Date | null;
}

export interface FieldValueRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly fieldId: string;
  readonly recordId: string;
  readonly text: string | null;
  readonly number: string | null;
  readonly date: string | null;
  readonly bool: boolean | null;
  readonly optionId: string | null;
  readonly userId: string | null;
  readonly setBy: string;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DefinitionPatch = Partial<
  Mutable<
    Pick<
      FieldDefinitionRow,
      | "label"
      | "agentFilled"
      | "agentBrief"
      | "required"
      | "showOnSheet"
      | "showOnTable"
      | "showOnFilter"
      | "position"
      | "archivedAt"
    >
  >
>;

export type OptionPatch = Partial<
  Mutable<Pick<FieldOptionRow, "label" | "position" | "archivedAt">>
>;

export type ValuePatch = Omit<FieldValueRow, "id" | "workspaceId" | "fieldId" | "recordId">;

/** Field operations inside one transaction. Every read and write is scoped by workspace. */
export interface FieldTx {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  /** Whether the company, contact or deal is in the workspace. */
  recordExists(entity: FieldEntity, workspaceId: string, id: string): Promise<boolean>;
  /** Whether any definition, option or value has this id, in any workspace. */
  idTaken(table: "definition" | "option" | "value", id: string): Promise<boolean>;
  definition(workspaceId: string, id: string): Promise<FieldDefinitionRow | null>;
  /** An entity's definitions, archived ones included, in no set order. */
  definitions(workspaceId: string, entity: string): Promise<readonly FieldDefinitionRow[]>;
  insertDefinition(row: FieldDefinitionRow): Promise<void>;
  updateDefinition(workspaceId: string, id: string, patch: DefinitionPatch): Promise<boolean>;
  option(workspaceId: string, id: string): Promise<FieldOptionRow | null>;
  options(workspaceId: string, fieldId: string): Promise<readonly FieldOptionRow[]>;
  insertOption(row: FieldOptionRow): Promise<void>;
  updateOption(workspaceId: string, id: string, patch: OptionPatch): Promise<boolean>;
  value(workspaceId: string, fieldId: string, recordId: string): Promise<FieldValueRow | null>;
  insertValue(row: FieldValueRow): Promise<void>;
  updateValue(workspaceId: string, id: string, patch: ValuePatch): Promise<void>;
  removeValue(workspaceId: string, id: string): Promise<void>;
}

export interface FieldStore {
  transact<A>(fn: (tx: FieldTx) => Promise<A>): Promise<{ result: A; txid: number }>;
  /** Reads outside a write, for the agent's field list. */
  read<A>(fn: (tx: FieldTx) => Promise<A>): Promise<A>;
}

const toDefinition = (row: FieldDefinitionRow): FieldDefinitionRow => ({
  id: row.id,
  workspaceId: row.workspaceId,
  entity: row.entity,
  key: row.key,
  label: row.label,
  type: row.type,
  agentFilled: row.agentFilled,
  agentBrief: row.agentBrief,
  required: row.required,
  showOnSheet: row.showOnSheet,
  showOnTable: row.showOnTable,
  showOnFilter: row.showOnFilter,
  position: row.position,
  archivedAt: row.archivedAt,
});

const toOption = (row: FieldOptionRow): FieldOptionRow => ({
  id: row.id,
  workspaceId: row.workspaceId,
  fieldId: row.fieldId,
  label: row.label,
  position: row.position,
  archivedAt: row.archivedAt,
});

function fieldTx(tx: DbTx | Db): FieldTx {
  const orm = tx.orm.public;

  return {
    isMember: async (workspaceId, userId) =>
      (await orm.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    recordExists: async (entity, workspaceId, id) => {
      const filter = { id, workspaceId };

      if (entity === "company") return (await orm.Company.where(filter).first()) !== null;

      if (entity === "contact") return (await orm.Contact.where(filter).first()) !== null;

      return (await orm.Deal.where(filter).first()) !== null;
    },
    idTaken: async (table, id) => {
      if (table === "definition") return (await orm.FieldDefinition.where({ id }).first()) !== null;

      if (table === "option") return (await orm.FieldOption.where({ id }).first()) !== null;

      return (await orm.FieldValue.where({ id }).first()) !== null;
    },
    definition: async (workspaceId, id) => {
      const row = await orm.FieldDefinition.where({ id, workspaceId }).first();

      return row ? toDefinition(row) : null;
    },
    definitions: async (workspaceId, entity) =>
      (await orm.FieldDefinition.where({ workspaceId, entity }).all()).map(toDefinition),
    insertDefinition: async (row) => {
      await orm.FieldDefinition.create({ ...row });
    },
    updateDefinition: async (workspaceId, id, patch) =>
      (await orm.FieldDefinition.where({ id, workspaceId }).update({
        ...patch,
        updatedAt: new Date(),
      })) !== null,
    option: async (workspaceId, id) => {
      const row = await orm.FieldOption.where({ id, workspaceId }).first();

      return row ? toOption(row) : null;
    },
    options: async (workspaceId, fieldId) =>
      (await orm.FieldOption.where({ workspaceId, fieldId }).all()).map(toOption),
    insertOption: async (row) => {
      await orm.FieldOption.create({ ...row });
    },
    updateOption: async (workspaceId, id, patch) =>
      (await orm.FieldOption.where({ id, workspaceId }).update({
        ...patch,
        updatedAt: new Date(),
      })) !== null,
    value: async (workspaceId, fieldId, recordId) => {
      const row = await orm.FieldValue.where({ workspaceId, fieldId, recordId }).first();

      return row
        ? {
            id: row.id,
            workspaceId: row.workspaceId,
            fieldId: row.fieldId,
            recordId: row.recordId,
            text: row.text,
            number: row.number,
            date: row.date,
            bool: row.bool,
            optionId: row.optionId,
            userId: row.userId,
            setBy: row.setBy,
          }
        : null;
    },
    insertValue: async (row) => {
      await orm.FieldValue.create({ ...row });
    },
    updateValue: async (workspaceId, id, patch) => {
      await orm.FieldValue.where({ id, workspaceId }).update({ ...patch, updatedAt: new Date() });
    },
    removeValue: async (workspaceId, id) => {
      await orm.FieldValue.where({ id, workspaceId }).delete();
    },
  };
}

/** The Prisma 8 store: ORM writes plus `pg_current_xact_id()` in the same transaction. */
export function prismaFieldStore(db: Db): FieldStore {
  return {
    transact: (fn) => transactWithTxid(db, (tx) => fn(fieldTx(tx))),
    read: (fn) => fn(fieldTx(db)),
  };
}
