import { DEFAULT_PERMISSION_MODE, isPermissionMode, type PermissionMode } from "@crm/core/chat";
import type { SessionAuthContext } from "eve/context";

/** Who a CRM call acts for: the chat's caller and, for chats from the CRM, its workspace. */
export interface CrmCaller {
  readonly userId: string;
  readonly workspaceId: string | null;
  /** The chat's permission mode; Manual when the caller didn't come through a chat. */
  readonly permissionMode: PermissionMode;
}

/** The CRM user behind a turn; null for service, local-dev and anonymous callers. */
export function crmCaller(auth: SessionAuthContext | null | undefined): CrmCaller | null {
  if (auth?.principalType !== "user") return null;

  const workspace = auth.attributes["workspaceId"];
  const mode = auth.attributes["permissionMode"];

  return {
    userId: auth.principalId,
    workspaceId: String(workspace) === workspace && workspace !== "" ? workspace : null,
    permissionMode:
      String(mode) === mode && isPermissionMode(mode) ? mode : DEFAULT_PERMISSION_MODE,
  };
}
