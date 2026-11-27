import type { ChatRecordKind } from "@crm/core/records";
import { defineDynamic, defineInstructions } from "eve/instructions";
import { crmCaller } from "../lib/crm-caller.ts";

const READ_TOOL: Record<ChatRecordKind, string> = {
  company: "connections__crm__get_company",
  contact: "connections__crm__get_contact",
  deal: "connections__crm__get_deal",
};

/**
 * What the agent knows about a chat started from a record sheet's Agent tab (ADR 0024): which
 * record it is about. The person sees the chat on that record, so "they", "this company" and
 * "here" mean it.
 */
export function recordInstructions(kind: ChatRecordKind, id: string) {
  return `## This chat is about one ${kind}

The person started this chat from the ${kind}'s own page in the CRM: ${kind} id \`${id}\`. "This ${kind}", "they", "them" and "here" mean it. Read it with \`${READ_TOOL[kind]}\` before you answer, unless you already did in this chat, and work on it without asking which ${kind} they mean.`;
}

export default defineDynamic((ctx) => {
  const record = crmCaller(ctx.session.auth.current)?.record;

  return record
    ? defineInstructions({ content: recordInstructions(record.kind, record.id) })
    : null;
});
