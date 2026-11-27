import type { MemorySource } from "@crm/core/api";

/** How each kind of source reads in the graph and its sheets. */
export const SOURCE_KINDS: Record<NonNullable<MemorySource["kind"]>, string> = {
  website_research: "Website",
  member_note: "Note",
  agent_fact: "Assistant",
  chat: "Chat",
  email: "Email",
};

/** The graph's core, which every source links to. */
const CORE_KINDS = { workspace: "Workspace", company: "Company" };

const LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({ ...SOURCE_KINDS, ...CORE_KINDS }),
);

export function sourceKindLabel(kind: string) {
  return LABELS.get(kind) ?? "Source";
}
