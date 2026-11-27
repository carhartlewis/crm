import { mintAgentToken } from "@crm/core/auth/agent-token";
import { isConnectionAuthorizationRequiredError } from "eve/connections";
import type { CrmCaller } from "./crm-caller.ts";
import { gatewayAuthorization, gatewayUrl } from "./gateway.ts";

export { type CrmCaller, crmCaller } from "./crm-caller.ts";

/**
 * A token for the CRM API (gateway, skills, memory). A chat from the CRM carries its workspace:
 * the agent signs user and workspace with the secret it shares with the API, so no sign-in is
 * needed (ADR 0018). Other callers fall back to the user's MCP sign-in (ADR 0013), and get null
 * until they have signed in; this never starts a sign-in.
 */
export async function crmToken(
  caller: CrmCaller,
  secret: string | undefined = process.env["AGENT_PROXY_SECRET"],
): Promise<string | null> {
  if (caller.workspaceId && secret) {
    return mintAgentToken(secret, { userId: caller.userId, workspaceId: caller.workspaceId });
  }

  try {
    const { token } = await gatewayAuthorization.getToken({
      principal: { type: "user", id: caller.userId },
      connection: { url: gatewayUrl },
    });

    return token;
  } catch (error) {
    if (isConnectionAuthorizationRequiredError(error)) return null;

    throw error;
  }
}
