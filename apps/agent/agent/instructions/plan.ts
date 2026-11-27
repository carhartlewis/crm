import { defineDynamic, defineInstructions } from "eve/instructions";
import { crmCaller } from "../lib/crm-caller.ts";

/** What the agent does while the chat is in Plan mode; changes are refused (`call-approval`). */
export const PLAN_INSTRUCTIONS = `## Plan mode

This chat is in Plan mode. Research with read-only tools as much as you need, but change nothing: calls that create, update, save, send or delete are refused.

End your reply with the plan, as a numbered list of the changes you will make, one line each, naming each record. Nothing else after the list: the person runs the plan with a button, or tells you what to change.`;

export default defineDynamic((ctx) =>
  crmCaller(ctx.session.auth.current)?.permissionMode === "plan"
    ? defineInstructions({ content: PLAN_INSTRUCTIONS })
    : null,
);
