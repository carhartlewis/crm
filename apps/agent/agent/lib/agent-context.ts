import { Option, Schema } from "effect";

/**
 * Who the agent works for in a turn, from the CRM (`GET /api/agent/context`): the member and
 * their workspace. A new workspace's research takes minutes, and until it lands memory knows
 * nothing about the member's own company; these instructions name it from the first message.
 */
const AgentContext = Schema.Struct({
  workspace: Schema.Struct({ name: Schema.String, website: Schema.String }),
  member: Schema.Struct({ name: Schema.String, email: Schema.String, role: Schema.String }),
});

export type AgentContext = typeof AgentContext.Type;

const decode = Schema.decodeUnknownOption(AgentContext);

export interface AgentContextOptions {
  readonly url: string;
  /** The user's CRM token, or null when there is none. Must never start a sign-in. */
  readonly token: () => Promise<string | null>;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** The caller's context, or null without a token or when the CRM can't be reached. */
export async function loadAgentContext(options: AgentContextOptions): Promise<AgentContext | null> {
  const token = await options.token();

  if (!token) return null;

  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });

    if (!response.ok) return null;

    return Option.getOrNull(decode(await response.json()));
  } catch {
    return null;
  }
}

/** Member-typed text on one short line, so a name can't add lines to the instructions. */
const inline = (text: string, max = 120) => text.replace(/\s+/g, " ").trim().slice(0, max);

export function agentContextInstructions(context: AgentContext) {
  const workspace = inline(context.workspace.name) || "the member's company";
  const website = inline(context.workspace.website, 200);
  const name = inline(context.member.name) || "A member";
  const email = inline(context.member.email, 200);
  const site = website ? ` (${website})` : "";

  return `## Who you work for

You work for ${name}${email ? ` (${email})` : ""}, ${inline(context.member.role, 40) || "a member"} of ${workspace}${site}. This CRM is ${workspace}'s. "We", "us", "our" and "our company" mean ${workspace}, and "I" and "me" mean ${name}.

When memory has nothing about ${workspace} yet (research of a new workspace takes a few minutes), find what you need yourself: read ${website || "its website"}, search the web for ${workspace}, and look in the member's connected apps. Never ask the member who their company is.`;
}
