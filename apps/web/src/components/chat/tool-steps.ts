import type { ToolStepState } from "@crm/ui/patterns/tool-step";
import { Option, Schema } from "effect";
import type { EveMessagePart } from "eve/client";

export type ToolPart = Extract<EveMessagePart, { type: "tool" }>;

/** eve's call states as tool-step states. */
export function stepState(part: ToolPart): ToolStepState {
  switch (part.state) {
    case "approval":
      return "waiting";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "rejected":
    case "cancelled":
      return "denied";
    default:
      return "pending";
  }
}

/** "Connections: Create company" reads as "Create company": every CRM tool is on that connection. */
export function stepLabel(part: ToolPart) {
  return part.label.replace(/^Connections:\s*/, "");
}

/** The fields of a call's input that name what it acts on. */
const NamedInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
  subject: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.NullOr(Schema.String)),
});

const decodeNamedInput = Schema.decodeUnknownOption(NamedInput);

/** What a call acts on, from its input: a name, title or query, when it has one. */
export function stepDetail(part: ToolPart): string | undefined {
  return Option.match(decodeNamedInput(part.input), {
    onNone: () => undefined,
    onSome: (input) => {
      const value = [input.name, input.title, input.query, input.subject, input.text, input.domain]
        .find((field) => field?.trim())
        ?.trim();

      return value?.slice(0, 80);
    },
  });
}

/** Tool search and task controls are the agent's own housekeeping, not steps to show. */
export function shownCall(part: ToolPart) {
  return !part.hidden && part.kind !== "control" && !part.name.startsWith("eve__");
}

/** A message's parts as shown: runs of calls to one tool become one group. */
type Block =
  | { readonly kind: "part"; readonly key: string; readonly part: EveMessagePart }
  | { readonly kind: "calls"; readonly key: string; readonly calls: readonly ToolPart[] };

export function messageBlocks(parts: readonly EveMessagePart[]): Block[] {
  const blocks: Block[] = [];

  parts.forEach((part, index) => {
    // Housekeeping calls show nothing, so they don't break a run either.
    if (part.type === "tool" && !shownCall(part)) return;

    const last = blocks.at(-1);

    if (part.type === "tool") {
      if (last?.kind === "calls" && stepLabel(last.calls[0] ?? part) === stepLabel(part)) {
        blocks[blocks.length - 1] = { ...last, calls: [...last.calls, part] };

        return;
      }

      blocks.push({ kind: "calls", key: part.callId, calls: [part] });

      return;
    }

    // Thinking split across steps reads as one "Thought for…" row, not several in a row.
    if (part.type === "reasoning" && last?.kind === "part" && last.part.type === "reasoning") {
      const streaming = part.state === "streaming" || last.part.state === "streaming";

      blocks[blocks.length - 1] = {
        ...last,
        part: {
          ...last.part,
          text: `${last.part.text}\n\n${part.text}`,
          state: streaming ? "streaming" : "done",
        },
      };

      return;
    }

    blocks.push({ kind: "part", key: partKey(part, index), part });
  });

  return blocks;
}

/** A run's state: waiting or running while any call is; failed when one failed. */
export function runState(states: readonly ToolStepState[]): ToolStepState {
  const order: ToolStepState[] = ["waiting", "pending", "failed", "done"];

  return order.find((state) => states.includes(state)) ?? "denied";
}

/** "Capgo, Docspring and 4 more", or the count when the calls name nothing. */
export function runDetail(details: readonly (string | undefined)[]) {
  const named = [...new Set(details.filter((detail) => detail !== undefined))];

  if (named.length === 0) return `${details.length} times`;

  if (named.length <= 2) return named.join(", ");

  return `${named.slice(0, 2).join(", ")} and ${named.length - 2} more`;
}

export function partKey(part: EveMessagePart, index: number) {
  if (part.type === "tool") return part.callId;

  if (part.type === "interaction") return part.interactionId;

  if ((part.type === "text" || part.type === "reasoning") && part.id) return part.id;

  return `${part.type}-${index}`;
}
