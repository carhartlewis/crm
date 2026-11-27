import { type CallHints, callDecision, callKind } from "@crm/core/chat";
import type { SessionAuthContext } from "eve/context";
import type { ApprovalPolicy, ApprovalStatus } from "eve/tools/approval";
import { crmCaller } from "./crm-caller.ts";

/** The reason on a risky call that ran without asking, in Bypass permissions. */
export const RISKY_REASON = "risky";

/** Why a change is refused in Plan mode: the model reads it and adds the step to its plan. */
export const PLAN_REASON =
  "The chat is in Plan mode, so nothing may change yet. Add this step to your plan instead; it runs when the person runs the plan.";

/** The bare tool name of eve's qualified `<connection>__<tool>`. */
export function bareToolName(connection: string, toolName: string) {
  const prefix = `${connection}__`;

  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}

/**
 * Approval for one connection's tools (ADR 0019): the chat's permission mode and what the call
 * does decide whether it runs, waits for the person, or runs marked as risky. A caller that is
 * not a CRM user is refused.
 */
export function callApproval(connection: string): ApprovalPolicy {
  return ({ toolName, toolAnnotations, session }) =>
    decideCall(connection, session.auth.current, toolName, toolAnnotations);
}

/** The decision for one call by the turn's caller; `callApproval` without eve's context. */
export function decideCall(
  connection: string,
  auth: SessionAuthContext | null | undefined,
  toolName: string,
  toolAnnotations: CallHints | undefined,
): ApprovalStatus {
  const caller = crmCaller(auth);

  if (!caller) {
    return { type: "denied", reason: "Only a signed-in member of the workspace can use this." };
  }

  // `crm__list_companies` from `connections__crm__list_companies`: the app prefix stays, so
  // the name rules see `list_companies` through `<app>__`.
  const tool = bareToolName(connection, toolName);
  const decision = callDecision(caller.permissionMode, callKind(tool, toolAnnotations));

  if (decision === "run") return "not-applicable";

  if (decision === "ask") return "user-approval";

  if (decision === "refuse") return { type: "denied", reason: PLAN_REASON };

  return { type: "approved", reason: RISKY_REASON };
}
