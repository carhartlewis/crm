import { defineDynamic, defineInstructions } from "eve/instructions";
import { agentContextInstructions, loadAgentContext } from "../lib/agent-context.ts";
import { crmCaller, crmToken } from "../lib/crm-token.ts";
import { agentContextUrl } from "../lib/gateway.ts";

/** Who the agent works for: the member and their workspace, read once per turn. */
export default defineDynamic(async (ctx) => {
  const caller = crmCaller(ctx.session.auth.current);

  if (!caller || !ctx.turn) return null;

  const context = await ctx.memo(`agent-context:${ctx.turn.id}`, () =>
    loadAgentContext({ url: agentContextUrl, token: () => crmToken(caller) }),
  );

  return context ? defineInstructions({ content: agentContextInstructions(context) }) : null;
});
