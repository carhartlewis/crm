import { FIELD_ENTITIES, FIELD_TYPES } from "@crm/core/fields";
import type { LocalTool } from "@crm/integrations/gateway";
import { Effect, Schema } from "effect";
import { run, tool } from "./crm-tools.ts";
import type { FieldsService } from "./Fields.ts";
import type { AgentCaller } from "./Memory.ts";

/**
 * The agent's custom-field tools: it reads the workspace's fields with their briefs, and fills
 * the ones members let it fill. Its values are marked as set by the agent, and it never replaces
 * a member's value unless they ask.
 */

const Entity = Schema.String.annotate({ description: FIELD_ENTITIES.join(", ") });

const RecordId = Schema.String.annotate({
  description: "The company (com_…), contact (ctc_…) or deal (del_…) id.",
});

const TYPE_HELP = FIELD_TYPES.map((type) => type.id).join(", ");

export function fieldTools(fields: FieldsService, caller: AgentCaller): readonly LocalTool[] {
  const actor = { userId: caller.userId, activeWorkspaceId: caller.workspaceId };

  return [
    tool(
      {
        name: "list_fields",
        description: `The workspace's custom fields for companies, contacts or deals: key, label, type (${TYPE_HELP}), whether you may fill it (agentFilled), the brief that says what counts as an answer, and a select field's options. Pass record_id to see that record's current values and who set them.`,
        readOnly: true,
        input: Schema.Struct({ entity: Entity, record_id: Schema.optional(RecordId) }),
      },
      (input) =>
        run(
          fields
            .agentList(actor, input.entity, input.record_id)
            .pipe(Effect.map((list) => ({ entity: input.entity, fields: list }))),
        ),
    ),
    tool(
      {
        name: "set_field_value",
        description:
          "Fill one custom field on a company, contact or deal, from crm__list_fields. Only fields with agentFilled true. Follow the field's brief and leave it empty when you can't find a sourced answer. Select fields take one of the option labels; member fields a user id from crm__list_members; dates YYYY-MM-DD; checkboxes true or false. null clears it.",
        readOnly: false,
        input: Schema.Struct({
          entity: Schema.optional(Entity),
          field: Schema.String.annotate({
            description: "The field's key (pass entity too), or its id (fdf_…).",
          }),
          record_id: RecordId,
          value: Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
          replace_member_value: Schema.optional(Schema.Boolean).annotate({
            description: "Replace a value a member set. Only when the member asked you to.",
          }),
        }),
      },
      (input) =>
        run(
          fields
            .agentSet(actor, input)
            .pipe(Effect.as({ field: input.field, recordId: input.record_id, set: true })),
        ),
    ),
  ];
}
