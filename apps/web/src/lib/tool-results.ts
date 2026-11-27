import type { Json } from "@crm/core/chat";
import { Option, Schema } from "effect";

/**
 * CRM list tools whose results the chat shows as a table (ADR 0024), as in the reference's agent
 * results: `crm__list_deals`, `crm__list_companies` and `crm__list_contacts`. Pure, so tested.
 */

const DealRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  stage: Schema.String,
  amount: Schema.NullOr(Schema.String),
  currency: Schema.String,
  expectedCloseDate: Schema.NullOr(Schema.String),
  companyId: Schema.String,
  companyName: Schema.String,
});

const CompanyRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  domain: Schema.NullOr(Schema.String),
  industry: Schema.NullOr(Schema.String),
  location: Schema.NullOr(Schema.String),
  contacts: Schema.Number,
  openDeals: Schema.Number,
});

const ContactRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  title: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  companyId: Schema.NullOr(Schema.String),
  companyName: Schema.NullOr(Schema.String),
});

export type DealResultRow = typeof DealRow.Type;

export type CompanyResultRow = typeof CompanyRow.Type;

export type ContactResultRow = typeof ContactRow.Type;

export type ListResult =
  | { readonly kind: "deals"; readonly rows: readonly DealResultRow[] }
  | { readonly kind: "companies"; readonly rows: readonly CompanyResultRow[] }
  | { readonly kind: "contacts"; readonly rows: readonly ContactResultRow[] };

/** A finished or running tool call, as the chat has it (eve's tool part). */
export interface ToolCallResult {
  readonly name: string;
  readonly state: string;
  readonly output?: unknown;
}

/**
 * Reads a CRM tool's answer whatever wraps it: MCP text content (JSON in the first text part),
 * MCP structured content, a JSON string, or the object itself.
 */
function outputReader<S extends Schema.Top & { readonly DecodingServices: never }>(schema: S) {
  const json = Schema.fromJsonString(schema);

  // A generic struct's decoded type doesn't narrow in TypeScript; each reader decodes `schema`.
  type Payload = S["Type"];

  const readers = [
    (output: ToolCallResult["output"]) =>
      Option.map(
        Schema.decodeUnknownOption(
          Schema.Struct({
            content: Schema.Tuple([Schema.Struct({ type: Schema.Literal("text"), text: json })]),
          }),
        )(output),
        // SAFETY: `text` was decoded by `json`, which is `schema` from a JSON string.
        (value): Payload => (value.content[0] as { readonly text: Payload }).text,
      ),
    (output: ToolCallResult["output"]) =>
      Option.map(
        Schema.decodeUnknownOption(Schema.Struct({ structuredContent: schema }))(output),
        // SAFETY: `structuredContent` was decoded by `schema`.
        (value): Payload => (value as { readonly structuredContent: Payload }).structuredContent,
      ),
    Schema.decodeUnknownOption(json),
    Schema.decodeUnknownOption(schema),
  ];

  return (output: ToolCallResult["output"]): Payload | null => {
    for (const read of readers) {
      const value = read(output);

      if (Option.isSome(value)) return value.value;
    }

    return null;
  };
}

const readDeals = outputReader(Schema.Struct({ deals: Schema.Array(DealRow) }));

const readCompanies = outputReader(Schema.Struct({ companies: Schema.Array(CompanyRow) }));

const readContacts = outputReader(Schema.Struct({ contacts: Schema.Array(ContactRow) }));

const McpTextPayload = Schema.Struct({
  content: Schema.Tuple([Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })]),
});

const decodeMcpText = Schema.decodeUnknownOption(McpTextPayload);

const decodeStructured = Schema.decodeUnknownOption(
  Schema.Struct({ structuredContent: Schema.Record(Schema.String, Schema.Unknown) }),
);

/** Text as JSON, or null when it isn't. */
function parseJson(text: string): Json | null {
  try {
    // SAFETY: `JSON.parse` only returns JSON values.
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
}

/**
 * A CRM tool's answer as JSON, whatever wraps it (MCP text or structured content, a JSON string),
 * for callers that decode it themselves.
 */
export function toolPayload(output: ToolCallResult["output"]): Json | null {
  const mcp = Option.getOrNull(decodeMcpText(output));

  if (mcp) return parseJson(mcp.content[0].text);

  const structured = Option.getOrNull(decodeStructured(output));

  if (structured) {
    // SAFETY: structured content is a JSON object.
    return structured.structuredContent as Json;
  }

  const text = Option.getOrNull(Schema.decodeUnknownOption(Schema.String)(output));

  if (text !== null) return parseJson(text);

  // SAFETY: a tool's output is JSON (eve keeps it as it came over the wire).
  return (output ?? null) as Json;
}

/** Which list a tool name is, from its CRM tool name (`connections__crm__list_deals`). */
function listTool(name: string) {
  const match = /(?:^|__)crm__list_(deals|companies|contacts)$/.exec(name);

  return match?.[1] ?? null;
}

/** The table a finished CRM list call shows, or null for any other call or an empty list. */
export function listResult(call: ToolCallResult): ListResult | null {
  if (call.state !== "completed") return null;

  const tool = listTool(call.name);

  if (tool === "deals") {
    const rows = readDeals(call.output)?.deals;

    return rows?.length ? { kind: "deals", rows } : null;
  }

  if (tool === "companies") {
    const rows = readCompanies(call.output)?.companies;

    return rows?.length ? { kind: "companies", rows } : null;
  }

  if (tool === "contacts") {
    const rows = readContacts(call.output)?.contacts;

    return rows?.length ? { kind: "contacts", rows } : null;
  }

  return null;
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(line);
}

const isTableRow = (line: string) => line.includes("|") && !isTableSeparator(line);

/**
 * Removes the first Markdown table from a reply: the model sometimes repeats a list the chat
 * already shows as a result table. Text before and after it stays.
 */
export function withoutRepeatedTable(markdown: string) {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isTableRow(lines[index] ?? "") || !isTableSeparator(lines[index + 1] ?? "")) continue;

    let end = index + 2;

    while (end < lines.length && isTableRow(lines[end] ?? "")) end += 1;

    return [...lines.slice(0, index), ...lines.slice(end)]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return markdown;
}

/** One person from `crm__find_people` (ADR 0027), as the API answers it. */
const PersonRow = Schema.Struct({
  name: Schema.String,
  title: Schema.NullOr(Schema.String),
  company: Schema.NullOr(Schema.String),
  companyDomain: Schema.NullOr(Schema.String),
  location: Schema.NullOr(Schema.String),
  linkedinUrl: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  emailStatus: Schema.NullOr(Schema.String),
  titleMatch: Schema.optional(Schema.NullOr(Schema.String)),
  summary: Schema.optional(Schema.NullOr(Schema.String)),
  /** Set when the person is already in the CRM. */
  contactId: Schema.NullOr(Schema.String),
});

export type PersonResultRow = typeof PersonRow.Type;

const readPeople = outputReader(Schema.Struct({ people: Schema.Array(PersonRow) }));

/** The people a finished `crm__find_people` call found, or null for any other call. */
export function peopleResult(call: ToolCallResult): readonly PersonResultRow[] | null {
  if (call.state !== "completed" || !/(?:^|__)crm__find_people$/.test(call.name)) return null;

  const rows = readPeople(call.output)?.people;

  return rows?.length ? rows : null;
}

const CallUsageSchema = Schema.Struct({
  usage: Schema.Struct({
    usageId: Schema.NullOr(Schema.String),
    priceMicro: Schema.Number,
    outcome: Schema.Literals(["hit", "miss", "error", "cached"]),
  }),
});

const decodeCallUsage = Schema.decodeUnknownOption(CallUsageSchema);

/** What a paid call cost (ADR 0027), from the `usage` its answer carries; null for free calls. */
export function callUsage(call: ToolCallResult) {
  if (call.state !== "completed") return null;

  return Option.match(decodeCallUsage(toolPayload(call.output)), {
    onNone: () => null,
    onSome: (value) => value.usage,
  });
}
