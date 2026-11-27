import { Option, Schema } from "effect";
import type { RecordKind } from "./records.ts";
import { type ToolCallResult, toolPayload } from "./tool-results.ts";

/**
 * The CRM records a turn's tool calls touched, read from the calls themselves rather than from
 * the model's words: a write or read shows its record as a chip on its step, and the reply's
 * names for these records open them. Pure, so tested.
 */

export interface TurnRecord {
  readonly kind: RecordKind;
  readonly id: string;
  /** The record's name when the call says it; an update that renames nothing doesn't. */
  readonly name: string | undefined;
}

interface Call extends ToolCallResult {
  readonly input?: ToolCallResult["output"];
}

const WRITE = /(?:^|__)crm__(create|update|get)_(company|contact|deal)$/;
const LIST = /(?:^|__)crm__list_(companies|contacts|deals)$/;

const Answer = Schema.Struct({ id: Schema.String, name: Schema.optional(Schema.String) });

const NamedInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  first_name: Schema.optional(Schema.String),
  last_name: Schema.optional(Schema.NullOr(Schema.String)),
});

const Row = Schema.Struct({ id: Schema.String, name: Schema.String });

const decodeAnswer = Schema.decodeUnknownOption(Answer);

const decodeInput = Schema.decodeUnknownOption(NamedInput);

const Rows = Schema.Array(Row);

/** A tool's answer, as `toolPayload` reads it. */
type Payload = ReturnType<typeof toolPayload>;

const decodeCompanyRows = Schema.decodeUnknownOption(Schema.Struct({ companies: Rows }));

const decodeContactRows = Schema.decodeUnknownOption(Schema.Struct({ contacts: Rows }));

const decodeDealRows = Schema.decodeUnknownOption(Schema.Struct({ deals: Rows }));

/** The record kind a write tool's name ends with (`create_deal` → `deal`). */
function writeKind(name: string): RecordKind | null {
  switch (WRITE.exec(name)?.[2]) {
    case "company":
      return "company";
    case "contact":
      return "contact";
    case "deal":
      return "deal";
    default:
      return null;
  }
}

/** A list call's rows with their kind, or null for any other call. */
function listRows(
  name: string,
  payload: Payload,
): { readonly kind: RecordKind; readonly rows: readonly (typeof Row.Type)[] } | null {
  switch (LIST.exec(name)?.[1]) {
    case "companies":
      return {
        kind: "company",
        rows: Option.getOrNull(decodeCompanyRows(payload))?.companies ?? [],
      };
    case "contacts":
      return {
        kind: "contact",
        rows: Option.getOrNull(decodeContactRows(payload))?.contacts ?? [],
      };
    case "deals":
      return { kind: "deal", rows: Option.getOrNull(decodeDealRows(payload))?.deals ?? [] };
    default:
      return null;
  }
}

/** The name a create or update call gave its record: `name`, or a contact's first and last. */
function inputName(input: Call["input"]) {
  return Option.match(decodeInput(input), {
    onNone: () => undefined,
    onSome: (named) =>
      named.name?.trim() ||
      [named.first_name, named.last_name].filter(Boolean).join(" ").trim() ||
      undefined,
  });
}

/** The record a finished create, update or get call acted on, or null for any other call. */
export function callRecord(call: Call): TurnRecord | null {
  if (call.state !== "completed") return null;

  const kind = writeKind(call.name);

  if (!kind) return null;

  return Option.match(decodeAnswer(toolPayload(call.output)), {
    onNone: () => null,
    onSome: (answer) => ({
      kind,
      id: answer.id,
      name: answer.name?.trim() || inputName(call.input),
    }),
  });
}

/** Every record the calls touched or listed, once each, with the first name a call gave it. */
export function turnRecords(calls: readonly Call[]): TurnRecord[] {
  const byId = new Map<string, TurnRecord>();

  const add = (record: TurnRecord) => {
    const known = byId.get(record.id);

    if (!known) byId.set(record.id, record);
    else if (!known.name && record.name) byId.set(record.id, { ...known, name: record.name });
  };

  for (const call of calls) {
    const record = callRecord(call);

    if (record) {
      add(record);
      continue;
    }

    const list = call.state === "completed" ? listRows(call.name, toolPayload(call.output)) : null;

    if (!list) continue;

    for (const row of list.rows) {
      add({ kind: list.kind, id: row.id, name: row.name.trim() });
    }
  }

  return [...byId.values()];
}
