import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import {
  type FieldEntity,
  type FieldInput,
  fieldKey,
  isFieldEntity,
  isFieldId,
  isFieldOptionId,
  isFieldType,
  isFieldValueId,
  normalizeFieldBrief,
  normalizeFieldLabel,
  normalizeFieldValue,
  normalizeOptionLabel,
  normalizeOptionLabels,
  readFieldValue,
  type StoredValue,
  type ValueSetter,
} from "@crm/core/fields";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { Context, Effect, Layer } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import { Database } from "./Database.ts";
import {
  type DefinitionPatch,
  type FieldDefinitionRow,
  type FieldStore,
  type FieldTx,
  type OptionPatch,
  prismaFieldStore,
  type ValuePatch,
} from "./field-store.ts";
import { type Actor, done, type Outcome, run, type TxId } from "./record-writes.ts";

type Write<E = never> = Effect.Effect<TxId, NoActiveWorkspace | Invalid | E>;

export interface FillTarget {
  readonly id: string;
  readonly entity: string;
  readonly label: string;
}

export interface CreateFieldInput {
  readonly id: string;
  readonly entity: string;
  readonly label: string;
  readonly type: string;
  readonly agent_filled?: boolean | undefined;
  readonly agent_brief?: string | null | undefined;
  readonly required?: boolean | undefined;
  readonly show_on_sheet?: boolean | undefined;
  readonly show_on_table?: boolean | undefined;
  readonly show_on_filter?: boolean | undefined;
  readonly options?: readonly { readonly id: string; readonly label: string }[] | undefined;
}

export interface UpdateFieldInput {
  readonly label?: string | undefined;
  readonly agent_filled?: boolean | undefined;
  readonly agent_brief?: string | null | undefined;
  readonly required?: boolean | undefined;
  readonly show_on_sheet?: boolean | undefined;
  readonly show_on_table?: boolean | undefined;
  readonly show_on_filter?: boolean | undefined;
  readonly archived?: boolean | undefined;
}

export interface PutValueInput {
  readonly id?: string | undefined;
  readonly field_id: string;
  readonly record_id: string;
  readonly value: FieldInput;
}

/** A field as the agent reads it (`crm__list_fields`). */
export interface AgentField {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly type: string;
  readonly agentFilled: boolean;
  readonly brief: string | null;
  readonly required: boolean;
  /** A select field's live option labels; empty for other types. */
  readonly options: readonly string[];
  /** With a record: its current value (an option's label for selects) and who set it. */
  readonly value: string | boolean | null;
  readonly setBy: string | null;
}

export interface AgentSetInput {
  readonly entity?: string | undefined;
  /** The field's key (with `entity`) or its id. */
  readonly field: string;
  readonly record_id: string;
  /** Select fields take an option's label or id. */
  readonly value: FieldInput;
  /** Replace a value a member set; only when the member asked for it. */
  readonly replace_member_value?: boolean | undefined;
}

export interface FieldsService {
  readonly create: (actor: Actor, input: CreateFieldInput) => Write;
  readonly update: (actor: Actor, id: string, input: UpdateFieldInput) => Write<NotFound>;
  readonly reorder: (actor: Actor, entity: string, ids: readonly string[]) => Write;
  readonly createOption: (
    actor: Actor,
    fieldId: string,
    input: { readonly id: string; readonly label: string },
  ) => Write<NotFound>;
  readonly updateOption: (
    actor: Actor,
    fieldId: string,
    optionId: string,
    input: { readonly label?: string | undefined; readonly archived?: boolean | undefined },
  ) => Write<NotFound>;
  readonly reorderOptions: (
    actor: Actor,
    fieldId: string,
    ids: readonly string[],
  ) => Write<NotFound>;
  readonly putValue: (actor: Actor, input: PutValueInput) => Write<NotFound>;
  /** The live, agent-filled field a member asked to fill on every record ("Fill the rest"). */
  readonly fillTarget: (
    actor: Actor,
    fieldId: string,
  ) => Effect.Effect<FillTarget, NoActiveWorkspace | Invalid | NotFound>;
  readonly agentList: (
    actor: Actor,
    entity: string,
    recordId?: string,
  ) => Effect.Effect<readonly AgentField[], NoActiveWorkspace | Invalid>;
  readonly agentSet: (actor: Actor, input: AgentSetInput) => Write<NotFound>;
}

const invalid = (message: string) => Effect.fail(new Invalid({ message }));

const rejected = (message: string): Outcome<Invalid> => ({
  ok: false,
  error: new Invalid({ message }),
});

const missing = (kind: string): Outcome<NotFound> => ({
  ok: false,
  error: new NotFound({ message: `${kind} not found` }),
});

/** `archived: true` stamps now, `false` clears it, absent leaves it. */
/** Just the archive stamp of a definition or option patch. */
type ArchivePatch = Pick<DefinitionPatch, "archivedAt">;

function archivedAt(archived: boolean | undefined, now: Date): ArchivePatch {
  const patch: ArchivePatch = {};

  if (archived !== undefined) patch.archivedAt = archived ? now : null;

  return patch;
}

/** The ORM's value columns for a stored value (the others cleared). */
function valuePatch(stored: StoredValue, setBy: ValueSetter): ValuePatch {
  return {
    text: stored.column === "text" ? stored.value : null,
    number: stored.column === "number" ? stored.value : null,
    date: stored.column === "date" ? stored.value : null,
    bool: stored.column === "bool" ? stored.value : null,
    optionId: stored.column === "option_id" ? stored.value : null,
    userId: stored.column === "user_id" ? stored.value : null,
    setBy,
  };
}

const nextPosition = (rows: readonly { position: number }[]) =>
  rows.reduce((max, row) => Math.max(max, row.position + 1), 0);

const byPosition = <R extends { position: number; label: string }>(rows: readonly R[]) =>
  rows.toSorted(
    (left, right) => left.position - right.position || left.label.localeCompare(right.label),
  );

/**
 * Writes one value inside a transaction: the field and record belong to the workspace and the
 * field's entity, select values are the field's options, member values are members.
 */
async function writeValue(
  tx: FieldTx,
  workspaceId: string,
  field: FieldDefinitionRow,
  input: PutValueInput,
  setBy: ValueSetter,
  replaceMember: boolean,
): Promise<Outcome<Invalid>> {
  if (field.archivedAt) return rejected("That field is archived");

  if (setBy === "agent" && !field.agentFilled) {
    return rejected(`${field.label} is filled by members only`);
  }

  if (!isFieldEntity(field.entity) || !isFieldType(field.type)) {
    return rejected("That field can't hold values");
  }

  if (!(await tx.recordExists(field.entity, workspaceId, input.record_id))) {
    return rejected(`That ${field.entity} is not in this workspace`);
  }

  const normalized = normalizeFieldValue(field.type, input.value);

  if (!normalized.ok) return rejected(`${field.label}: ${normalized.message}`);

  const stored = normalized.value;

  if (stored?.column === "option_id") {
    const option = await tx.option(workspaceId, stored.value);

    if (!option || option.fieldId !== field.id || option.archivedAt) {
      return rejected(`${field.label}: choose one of its options`);
    }
  }

  if (stored?.column === "user_id" && !(await tx.isMember(workspaceId, stored.value))) {
    return rejected(`${field.label}: choose a member of this workspace`);
  }

  const existing = await tx.value(workspaceId, field.id, input.record_id);

  if (setBy === "agent" && existing?.setBy === "member" && !replaceMember) {
    return rejected(
      `A member set ${field.label}. Replace it only when they ask, with replace_member_value.`,
    );
  }

  if (stored === null) {
    if (field.required) return rejected(`${field.label} is required`);

    if (existing) await tx.removeValue(workspaceId, existing.id);

    return done;
  }

  if (existing) {
    await tx.updateValue(workspaceId, existing.id, valuePatch(stored, setBy));

    return done;
  }

  const id =
    input.id && isFieldValueId(input.id) && !(await tx.idTaken("value", input.id))
      ? input.id
      : createId(ID_PREFIXES.field_value);

  await tx.insertValue({
    id,
    workspaceId,
    fieldId: field.id,
    recordId: input.record_id,
    ...valuePatch(stored, setBy),
  });

  return done;
}

/** A field as the agent reads it, with a record's value when one is given. */
async function describeField(
  tx: FieldTx,
  workspaceId: string,
  field: FieldDefinitionRow,
  recordId: string | undefined,
): Promise<AgentField> {
  const options =
    field.type === "select"
      ? byPosition(await tx.options(workspaceId, field.id)).filter((option) => !option.archivedAt)
      : [];

  const value = recordId ? await tx.value(workspaceId, field.id, recordId) : null;

  const raw = value
    ? readFieldValue(field.type, {
        text: value.text,
        number: value.number,
        date: value.date,
        bool: value.bool,
        option_id: value.optionId,
        user_id: value.userId,
      })
    : null;

  // A select's value reads as its option's label, the words the agent passes back.
  const shown =
    field.type === "select" && raw !== null
      ? (options.find((option) => option.id === String(raw))?.label ?? null)
      : raw;

  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    agentFilled: field.agentFilled,
    brief: field.agentBrief,
    required: field.required,
    options: options.map((option) => option.label),
    value: shown,
    setBy: value?.setBy ?? null,
  };
}

/** A select field of the workspace, or why not. */
async function selectField(tx: FieldTx, workspaceId: string, fieldId: string) {
  const field = await tx.definition(workspaceId, fieldId);

  if (!field) return missing("Field");

  return field.type === "select" ? null : rejected("Only select fields have options");
}

export function makeFields(store: FieldStore, now = () => new Date()): FieldsService {
  /** One write: membership check, `apply` and the txid in one transaction. */
  const write = <E>(
    actor: Actor,
    label: string,
    apply: (workspaceId: string, tx: FieldTx) => Promise<Outcome<E>>,
  ) =>
    Effect.gen(function* () {
      const { result, txid } = yield* run(label, () =>
        store.transact(async (tx): Promise<Outcome<E | NoActiveWorkspace>> => {
          const workspace = authorizeWorkspace({
            activeWorkspaceId: actor.activeWorkspaceId,
            isMember: actor.activeWorkspaceId
              ? await tx.isMember(actor.activeWorkspaceId, actor.userId)
              : false,
          });

          if (!workspace.ok) {
            return { ok: false, error: new NoActiveWorkspace({ message: workspace.message }) };
          }

          return apply(workspace.value, tx);
        }),
      );

      if (!result.ok) return yield* Effect.fail(result.error);

      return { txid } satisfies TxId;
    });

  const putValue = (actor: Actor, input: PutValueInput, setBy: ValueSetter, replace = false) => {
    if (!isFieldId(input.field_id))
      return Effect.fail(new NotFound({ message: "Field not found" }));

    return write<Invalid | NotFound>(actor, "put field value", async (workspaceId, tx) => {
      const field = await tx.definition(workspaceId, input.field_id);

      if (!field) return missing("Field");

      return writeValue(tx, workspaceId, field, input, setBy, replace);
    });
  };

  return {
    create: (actor, input) => {
      if (!isFieldId(input.id)) return invalid("That field id is not valid");

      if (!isFieldEntity(input.entity))
        return invalid("Fields belong to a company, contact or deal");

      if (!isFieldType(input.type)) return invalid("Choose a field type");

      const label = normalizeFieldLabel(input.label);

      if (!label.ok) return invalid(label.message);

      const brief = normalizeFieldBrief(input.agent_brief ?? null);

      if (!brief.ok) return invalid(brief.message);

      const options = input.options ?? [];

      const labels =
        input.type === "select" ? normalizeOptionLabels(options.map((o) => o.label)) : null;

      if (labels && !labels.ok) return invalid(labels.message);

      if (input.type !== "select" && options.length > 0) {
        return invalid("Only select fields have options");
      }

      if (options.some((option) => !isFieldOptionId(option.id))) {
        return invalid("That option id is not valid");
      }

      const entity: FieldEntity = input.entity;
      const type = input.type;

      return write<Invalid>(actor, "create field", async (workspaceId, tx) => {
        if (await tx.idTaken("definition", input.id)) {
          return rejected("A field with this id already exists");
        }

        const existing = await tx.definitions(workspaceId, entity);

        if (
          existing.some(
            (field) => !field.archivedAt && field.label.toLowerCase() === label.value.toLowerCase(),
          )
        ) {
          return rejected(`There is already a field called ${label.value}`);
        }

        await tx.insertDefinition({
          id: input.id,
          workspaceId,
          entity,
          key: fieldKey(
            label.value,
            existing.map((field) => field.key),
          ),
          label: label.value,
          type,
          agentFilled: input.agent_filled ?? true,
          agentBrief: brief.value,
          required: input.required ?? false,
          showOnSheet: input.show_on_sheet ?? true,
          showOnTable: input.show_on_table ?? false,
          showOnFilter: input.show_on_filter ?? false,
          position: nextPosition(existing),
          archivedAt: null,
        });

        // Options keep the order given; blank ones were dropped by the rule above.
        const kept = options.filter((option) => option.label.trim() !== "");

        for (const [position, option] of kept.entries()) {
          // oxlint-disable-next-line no-await-in-loop -- at most 100 options, in one transaction.
          if (await tx.idTaken("option", option.id)) {
            return rejected("An option with this id already exists");
          }

          // oxlint-disable-next-line no-await-in-loop -- as above.
          await tx.insertOption({
            id: option.id,
            workspaceId,
            fieldId: input.id,
            label: labels?.ok ? (labels.value[position] ?? option.label) : option.label,
            position,
            archivedAt: null,
          });
        }

        return done;
      });
    },

    update: (actor, id, input) => {
      if (!isFieldId(id)) return Effect.fail(new NotFound({ message: "Field not found" }));

      const patch: DefinitionPatch = archivedAt(input.archived, now());

      if (input.agent_filled !== undefined) patch.agentFilled = input.agent_filled;

      if (input.required !== undefined) patch.required = input.required;

      if (input.show_on_sheet !== undefined) patch.showOnSheet = input.show_on_sheet;

      if (input.show_on_table !== undefined) patch.showOnTable = input.show_on_table;

      if (input.show_on_filter !== undefined) patch.showOnFilter = input.show_on_filter;

      let label: string | undefined;

      if (input.label !== undefined) {
        const result = normalizeFieldLabel(input.label);

        if (!result.ok) return invalid(result.message);

        label = result.value;
      }

      if (input.agent_brief !== undefined) {
        const brief = normalizeFieldBrief(input.agent_brief);

        if (!brief.ok) return invalid(brief.message);

        patch.agentBrief = brief.value;
      }

      return write<Invalid | NotFound>(actor, "update field", async (workspaceId, tx) => {
        const field = await tx.definition(workspaceId, id);

        if (!field) return missing("Field");

        if (label !== undefined) {
          const clash = (await tx.definitions(workspaceId, field.entity)).some(
            (other) =>
              other.id !== id &&
              !other.archivedAt &&
              other.label.toLowerCase() === label?.toLowerCase(),
          );

          if (clash) return rejected(`There is already a field called ${label}`);

          patch.label = label;
        }

        // A restored field goes to the end of the list.
        if (input.archived === false && field.archivedAt) {
          patch.position = nextPosition(await tx.definitions(workspaceId, field.entity));
        }

        await tx.updateDefinition(workspaceId, id, patch);

        return done;
      });
    },

    reorder: (actor, entity, ids) => {
      if (!isFieldEntity(entity)) return invalid("Fields belong to a company, contact or deal");

      if (new Set(ids).size !== ids.length) return invalid("A field is listed twice");

      return write<Invalid>(actor, "reorder fields", async (workspaceId, tx) => {
        const fields = new Map(
          (await tx.definitions(workspaceId, entity)).map((field) => [field.id, field]),
        );

        if (ids.some((id) => !fields.has(id))) return rejected("That field is not in this list");

        for (const [position, id] of ids.entries()) {
          if (fields.get(id)?.position !== position) {
            // oxlint-disable-next-line no-await-in-loop -- one list, in one transaction.
            await tx.updateDefinition(workspaceId, id, { position });
          }
        }

        // Every write changes a row, so the txid reaches the shape even when nothing moved.
        const first = ids[0];

        if (first) await tx.updateDefinition(workspaceId, first, {});

        return done;
      });
    },

    createOption: (actor, fieldId, input) => {
      if (!isFieldId(fieldId)) return Effect.fail(new NotFound({ message: "Field not found" }));

      if (!isFieldOptionId(input.id)) return invalid("That option id is not valid");

      const label = normalizeOptionLabel(input.label);

      if (!label.ok) return invalid(label.message);

      return write<Invalid | NotFound>(actor, "create field option", async (workspaceId, tx) => {
        const problem = await selectField(tx, workspaceId, fieldId);

        if (problem) return problem;

        if (await tx.idTaken("option", input.id)) {
          return rejected("An option with this id already exists");
        }

        const options = await tx.options(workspaceId, fieldId);

        if (
          options.some(
            (option) =>
              !option.archivedAt && option.label.toLowerCase() === label.value.toLowerCase(),
          )
        ) {
          return rejected(`"${label.value}" is already an option`);
        }

        await tx.insertOption({
          id: input.id,
          workspaceId,
          fieldId,
          label: label.value,
          position: nextPosition(options),
          archivedAt: null,
        });

        return done;
      });
    },

    updateOption: (actor, fieldId, optionId, input) => {
      if (!isFieldId(fieldId) || !isFieldOptionId(optionId)) {
        return Effect.fail(new NotFound({ message: "Option not found" }));
      }

      const patch: OptionPatch = { ...archivedAt(input.archived, now()) };
      let label: string | undefined;

      if (input.label !== undefined) {
        const result = normalizeOptionLabel(input.label);

        if (!result.ok) return invalid(result.message);

        label = result.value;
      }

      return write<Invalid | NotFound>(actor, "update field option", async (workspaceId, tx) => {
        const option = await tx.option(workspaceId, optionId);

        if (!option || option.fieldId !== fieldId) return missing("Option");

        const siblings = await tx.options(workspaceId, fieldId);

        if (label !== undefined) {
          const clash = siblings.some(
            (other) =>
              other.id !== optionId &&
              !other.archivedAt &&
              other.label.toLowerCase() === label?.toLowerCase(),
          );

          if (clash) return rejected(`"${label}" is already an option`);

          patch.label = label;
        }

        if (input.archived === false && option.archivedAt) patch.position = nextPosition(siblings);

        await tx.updateOption(workspaceId, optionId, patch);

        return done;
      });
    },

    reorderOptions: (actor, fieldId, ids) => {
      if (!isFieldId(fieldId)) return Effect.fail(new NotFound({ message: "Field not found" }));

      if (new Set(ids).size !== ids.length) return invalid("An option is listed twice");

      return write<Invalid | NotFound>(actor, "reorder field options", async (workspaceId, tx) => {
        const problem = await selectField(tx, workspaceId, fieldId);

        if (problem) return problem;

        const options = new Map(
          (await tx.options(workspaceId, fieldId)).map((option) => [option.id, option]),
        );

        if (ids.some((id) => !options.has(id))) return rejected("That option is not on this field");

        for (const [position, id] of ids.entries()) {
          // oxlint-disable-next-line no-await-in-loop -- one list, in one transaction.
          await tx.updateOption(workspaceId, id, { position });
        }

        return done;
      });
    },

    putValue: (actor, input) => putValue(actor, input, "member"),

    fillTarget: (actor, fieldId) => {
      if (!isFieldId(fieldId)) return Effect.fail(new NotFound({ message: "Field not found" }));

      let target: FillTarget | null = null;

      return write<Invalid | NotFound>(actor, "fill field", async (workspaceId, tx) => {
        const field = await tx.definition(workspaceId, fieldId);

        if (!field || field.archivedAt) return missing("Field");

        if (!field.agentFilled) return rejected("Let your agents fill this field first");

        target = { id: field.id, entity: field.entity, label: field.label };

        return done;
      }).pipe(
        Effect.flatMap(() =>
          target
            ? Effect.succeed(target)
            : Effect.fail(new NotFound({ message: "Field not found" })),
        ),
      );
    },

    agentList: (actor, entity, recordId) => {
      if (!isFieldEntity(entity)) return invalid("Pass company, contact or deal");

      return Effect.gen(function* () {
        const result = yield* run("list fields", () =>
          store.read(
            async (tx): Promise<Outcome<NoActiveWorkspace> & { fields?: AgentField[] }> => {
              const workspace = authorizeWorkspace({
                activeWorkspaceId: actor.activeWorkspaceId,
                isMember: actor.activeWorkspaceId
                  ? await tx.isMember(actor.activeWorkspaceId, actor.userId)
                  : false,
              });

              if (!workspace.ok) {
                return { ok: false, error: new NoActiveWorkspace({ message: workspace.message }) };
              }

              const workspaceId = workspace.value;

              const definitions = byPosition(
                (await tx.definitions(workspaceId, entity)).filter((field) => !field.archivedAt),
              );

              const fields = await Promise.all(
                definitions.map((field) => describeField(tx, workspaceId, field, recordId)),
              );

              return { ok: true, fields };
            },
          ),
        );

        if (!result.ok) return yield* Effect.fail(result.error);

        return result.fields ?? [];
      });
    },

    agentSet: (actor, input) =>
      write<Invalid | NotFound>(actor, "agent set field value", async (workspaceId, tx) => {
        let field: FieldDefinitionRow | null = null;

        if (isFieldId(input.field)) {
          field = await tx.definition(workspaceId, input.field);
        } else if (input.entity && isFieldEntity(input.entity)) {
          field =
            (await tx.definitions(workspaceId, input.entity)).find(
              (row) => row.key === input.field.trim() && !row.archivedAt,
            ) ?? null;
        } else {
          return rejected("Pass the field's id, or its key with the entity");
        }

        if (!field) return missing("Field");

        let value = input.value;

        // Selects take a label too: the agent reads labels from crm__list_fields.
        if (field.type === "select" && value !== null && !isFieldOptionId(String(value).trim())) {
          const wanted = String(value).trim().toLowerCase();

          const option = (await tx.options(workspaceId, field.id)).find(
            (row) => !row.archivedAt && row.label.toLowerCase() === wanted,
          );

          if (!option && wanted) {
            return rejected(`${field.label}: "${value}" is not one of its options`);
          }

          value = option?.id ?? null;
        }

        return writeValue(
          tx,
          workspaceId,
          field,
          { field_id: field.id, record_id: input.record_id, value },
          "agent",
          input.replace_member_value ?? false,
        );
      }),
  };
}

export class Fields extends Context.Service<Fields, FieldsService>()("@crm/api/services/Fields") {
  static readonly layer = Layer.effect(
    Fields,
    Effect.gen(function* () {
      return makeFields(prismaFieldStore(yield* Database));
    }),
  ).pipe(Layer.provide(Database.layer));
}
