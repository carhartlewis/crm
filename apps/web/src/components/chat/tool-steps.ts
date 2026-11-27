import type { ToolStepState } from "@crm/ui/patterns/tool-step";
import { Option, Schema } from "effect";
import { formatUsage, totalUsage } from "@crm/core/usage";
import type { EveMessage, EveMessagePart } from "eve/client";
import { callUsage } from "../../lib/tool-results.ts";

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
  const order: ToolStepState[] = ["waiting", "pending", "done", "failed"];

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

/** The fields of a stream event a turn's timing needs; the rest of the event is ignored. */
const TimedTurnEvent = Schema.Struct({
  type: Schema.Literals(["turn.started", "turn.settled"]),
  data: Schema.Struct({ turnId: Schema.String, outcome: Schema.optional(Schema.String) }),
  meta: Schema.Struct({ at: Schema.String }),
});

const decodeTimedTurnEvent = Schema.decodeUnknownOption(TimedTurnEvent);

/** "14s", "2m 5s". */
export function formatWorked(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * "Worked for 14s · 5 steps" under the last message of each finished turn, as in T3 Code: how
 * long the agent took and how many steps it ran. Keyed by message id; turns still running,
 * stopped or failed get none.
 */
export function turnSummaries(events: readonly unknown[], messages: readonly EveMessage[]) {
  const started = new Map<string, number>();
  const finished = new Map<string, number>();

  for (const event of events) {
    Option.match(decodeTimedTurnEvent(event), {
      onNone: () => undefined,
      onSome: ({ type, data, meta }) => {
        const at = Date.parse(meta.at);

        if (type === "turn.started") started.set(data.turnId, at);
        else if (data.outcome === "completed") finished.set(data.turnId, at);
      },
    });
  }

  const lastMessage = new Map<string, string>();
  const steps = new Map<string, number>();
  const spent = new Map<string, number>();

  for (const message of messages) {
    const turnId = message.metadata?.turnId;

    if (message.role !== "assistant" || !turnId) continue;

    lastMessage.set(turnId, message.id);
    steps.set(
      turnId,
      (steps.get(turnId) ?? 0) +
        message.parts.filter((part) => part.type === "tool" && shownCall(part)).length,
    );

    // What the turn's paid calls cost (ADR 0027).
    const usages = message.parts.flatMap((part) => {
      const usage = part.type === "tool" ? callUsage(part) : null;

      return usage ? [usage] : [];
    });

    spent.set(turnId, (spent.get(turnId) ?? 0) + totalUsage(usages));
  }

  const summaries = new Map<string, string>();

  for (const [turnId, messageId] of lastMessage) {
    const start = started.get(turnId);
    const end = finished.get(turnId);
    const count = steps.get(turnId) ?? 0;

    if (start === undefined || end === undefined || count === 0) continue;

    const cost = spent.get(turnId) ?? 0;

    summaries.set(
      messageId,
      `Worked for ${formatWorked(end - start)} · ${count} ${count === 1 ? "step" : "steps"}${
        cost > 0 ? ` · ${formatUsage(cost)}` : ""
      }`,
    );
  }

  return summaries;
}

/** A message's own words: its text parts, without steps or thinking. */
export function messageText(message: EveMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();
}

/**
 * The conversation up to and including one message, as plain text for a branch: each turn's
 * words with who said them. Steps and thinking are left out; the replies already report them.
 */
export function transcriptUpTo(messages: readonly EveMessage[], messageId: string) {
  const end = messages.findIndex((message) => message.id === messageId);

  return messages
    .slice(0, end === -1 ? messages.length : end + 1)
    .flatMap((message) => {
      const text = messageText(message);

      return text ? [`${message.role === "user" ? "Me" : "Assistant"}: ${text}`] : [];
    })
    .join("\n\n");
}
