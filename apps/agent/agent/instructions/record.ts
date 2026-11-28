import type { ChatRecordKind } from "@crm/core/records";
import { defineDynamic, defineInstructions } from "eve/instructions";
import { crmCaller } from "../lib/crm-caller.ts";

const READ_TOOL: Record<ChatRecordKind, string> = {
  company: "connections__crm__get_company",
  contact: "connections__crm__get_contact",
  deal: "connections__crm__get_deal",
};

/** What the read already includes, so the agent doesn't list it again. */
const RELATED: Record<ChatRecordKind, string> = {
  company: "its people and its deals",
  contact: "their company and the deals they are on",
  deal: "its company and the people on it",
};

/** The list filter that keeps a list call to this record. */
const FILTER: Record<ChatRecordKind, (id: string) => string> = {
  company: (id) => `\`companyId: "${id}"\` on \`…list_contacts\` and \`…list_deals\``,
  contact: (id) =>
    `\`contactId: "${id}"\` on \`…list_deals\`, and their \`companyId\` on \`…list_contacts\` for their colleagues`,
  deal: (id) => `\`dealId: "${id}"\` on \`…list_contacts\``,
};

/**
 * What the agent knows about a chat started from a record sheet's Agent tab (ADR 0024): which
 * record it is about. The person sees the chat on that record, so "they", "this company" and
 * "here" mean it, and a list for a question about it is filtered to it.
 */
export function recordInstructions(kind: ChatRecordKind, id: string) {
  return `## This chat is about one ${kind}

The person started this chat from the ${kind}'s own page in the CRM: ${kind} id \`${id}\`. "This ${kind}", "they", "them" and "here" mean it. Read it with \`${READ_TOOL[kind]}\` before you answer, unless you already did in this chat, and work on it without asking which ${kind} they mean.

The read includes ${RELATED[kind]}. Answer from it; don't list them again. When a question about this ${kind} needs a list call (a search, a stage, more than the read holds), filter it to this ${kind}: ${FILTER[kind](id)}. Leave the filter off only when the person asks about the wider CRM, such as other companies or the whole pipeline.`;
}

export default defineDynamic((ctx) => {
  const record = crmCaller(ctx.session.auth.current)?.record;

  return record
    ? defineInstructions({ content: recordInstructions(record.kind, record.id) })
    : null;
});
