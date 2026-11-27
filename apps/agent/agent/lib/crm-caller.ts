import type { SessionAuthContext } from "eve/context";

/** Who a CRM call acts for: the chat's caller and, for chats from the CRM, its workspace. */
export interface CrmCaller {
  readonly userId: string;
  readonly workspaceId: string | null;
}

/** The CRM user behind a turn; null for service, local-dev and anonymous callers. */
export function crmCaller(auth: SessionAuthContext | null | undefined): CrmCaller | null {
  if (auth?.principalType !== "user") return null;

  const workspace = auth.attributes["workspaceId"];

  return {
    userId: auth.principalId,
    workspaceId: String(workspace) === workspace && workspace !== "" ? workspace : null,
  };
}
