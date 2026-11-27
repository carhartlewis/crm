import type { Candidate } from "@crm/memory/jev";
import { z } from "zod";

/**
 * Reads a finished turn for memory: the chat as a transcript, and what in it Jev should judge,
 * the member's own messages and the emails they sent through a connected app. Pure, so it is
 * tested without eve.
 */

/** The parts of eve's history messages this file reads (AI SDK model message shapes). */
export interface TurnMessage {
  readonly role: string;
  readonly content: unknown;
}

export interface SentEmail {
  readonly to: readonly string[];
  readonly subject: string;
  readonly body: string;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** A connected app's tool that sends mail: Gmail `send_message`, `reply`, Superhuman … */
export function isSendEmailTool(name: string) {
  const tool = name.toLowerCase();

  return (
    /(send|reply|forward)/.test(tool) &&
    /(mail|message|email|draft)/.test(tool) &&
    !/create_draft|save_draft|list|search|get_/.test(tool)
  );
}

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

/** A string field; a value of another type reads as missing. */
const optionalText = z.string().optional().catch(undefined);

/** The email addresses anywhere in a recipient field, whatever shape the app gives it. */
const addresses = z
  .json()
  .optional()
  .catch(undefined)
  .transform((value) => (JSON.stringify(value) ?? "").match(EMAIL) ?? []);

/** A send tool's input. Apps name their fields differently; the first one present wins. */
const SentEmailInput = z
  .object({
    to: addresses,
    cc: addresses,
    bcc: addresses,
    recipients: addresses,
    recipient: addresses,
    body: optionalText,
    text: optionalText,
    content: optionalText,
    message: optionalText,
    plainText: optionalText,
    html: optionalText,
    htmlBody: optionalText,
    subject: optionalText,
  })
  .transform((input): SentEmail | null => {
    const recipients = [
      ...input.to,
      ...input.cc,
      ...input.bcc,
      ...input.recipients,
      ...input.recipient,
    ];

    const to = [...new Set(recipients.map((address) => address.toLowerCase()))];
    const text = input.body ?? input.text ?? input.content ?? input.message ?? input.plainText;
    const html = input.html ?? input.htmlBody;
    const body = (text ?? (html ? stripHtml(html) : "")).trim();

    return body ? { to, subject: input.subject?.trim() ?? "", body } : null;
  })
  .catch(null);

/** Whether a tool result is an error or a denial. */
const Failed = z
  .object({ type: z.string() })
  .transform((output) => output.type.startsWith("error") || output.type === "execution-denied")
  .catch(false);

/** One message part. Fields with another type than expected read as missing. */
const Part = z.object({
  type: optionalText,
  text: optionalText,
  toolCallId: optionalText,
  toolName: optionalText,
  input: SentEmailInput,
  output: Failed,
});

type Part = z.infer<typeof Part>;

/** A message's content: a string is one text part; anything that isn't a part is skipped. */
const Parts = z
  .union([
    z.string().transform((text) => [Part.parse({ type: "text", text })]),
    z
      .array(Part.nullable().catch(null))
      .transform((items) => items.flatMap((item) => (item ? [item] : []))),
  ])
  .catch([]);

function partsOf(message: TurnMessage): readonly Part[] {
  return Parts.parse(message.content);
}

export function messageText(message: TurnMessage) {
  return partsOf(message)
    .flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : []))
    .join("\n")
    .trim();
}

/** Emails sent successfully, by tool call id: a send call whose result is not an error or a denial. */
function sentEmailCalls(messages: readonly TurnMessage[]): ReadonlyMap<string, SentEmail> {
  const calls = new Map<string, SentEmail>();
  const succeeded = new Set<string>();

  for (const message of messages) {
    for (const part of partsOf(message)) {
      const id = part.toolCallId;

      if (!id || !isSendEmailTool(part.toolName ?? "")) continue;

      if (part.type === "tool-call") {
        if (part.input) calls.set(id, part.input);
      } else if (part.type === "tool-result" && !part.output) {
        succeeded.add(id);
      }
    }
  }

  return new Map([...calls].filter(([id]) => succeeded.has(id)));
}

export function sentEmails(messages: readonly TurnMessage[]): readonly SentEmail[] {
  return [...sentEmailCalls(messages).values()];
}

/** The messages of the latest turn: everything after the last member message before them. */
export function latestTurn(messages: readonly TurnMessage[]) {
  let start = messages.length;

  while (start > 0 && messages[start - 1]?.role !== "user") start -= 1;

  while (start > 0 && messages[start - 1]?.role === "user") start -= 1;

  return messages.slice(start);
}

/** The chat as plain text: who said what, and which emails went out. */
export function transcriptOf(messages: readonly TurnMessage[], member: string) {
  const sent = sentEmailCalls(messages);

  return messages
    .flatMap((message) => {
      if (message.role === "user") {
        const text = messageText(message);

        return text ? [`${member}: ${text}`] : [];
      }

      if (message.role !== "assistant") return [];

      const text = messageText(message);

      const emails = partsOf(message).flatMap((part) => {
        const email = part.toolCallId === undefined ? undefined : sent.get(part.toolCallId);

        return part.type === "tool-call" && email ? [email] : [];
      });

      return [
        ...(text ? [`Assistant: ${text}`] : []),
        ...emails.map(
          (email) => `[Email to ${email.to.join(", ")}: ${email.subject}]\n${email.body}`,
        ),
      ];
    })
    .join("\n\n");
}

/** Shorter text never holds a lasting fact worth a judgment ("ok", "send it"). */
const MIN_CANDIDATE = 20;

const MAX_CANDIDATES = 4;

export interface TurnCandidate {
  readonly candidate: Candidate;
  /** For emails: the recipients, which pick the companies it is about. */
  readonly recipients: readonly string[];
}

/** What Jev judges from one turn: the member's messages, then the emails they sent. */
export function candidatesOf(
  turn: readonly TurnMessage[],
  member: string,
  date: Date,
): readonly TurnCandidate[] {
  const day = date.toISOString();

  const said = turn.flatMap((message) => {
    const text = message.role === "user" ? messageText(message) : "";

    if (text.length < MIN_CANDIDATE) return [];

    return [
      {
        candidate: {
          what: "chat_message" as const,
          who: member,
          date: day,
          text: text.slice(0, 2_000),
        },
        recipients: [],
      },
    ];
  });

  const sent = sentEmails(turn).map((email) => ({
    candidate: {
      what: "sent_email" as const,
      who: member,
      date: day,
      text: [email.subject && `Subject: ${email.subject}`, email.body]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2_000),
    },
    recipients: email.to,
  }));

  return [...said, ...sent].slice(0, MAX_CANDIDATES);
}
