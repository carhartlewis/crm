import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { crmCaller, crmToken } from "../lib/crm-token.ts";
import { gatewayAuthorization, gatewayUrl } from "../lib/gateway.ts";

const description =
  "The CRM itself (crm__: companies, workspace members, memory) and the apps the user connected to it: Granola meeting notes and transcripts, Superhuman email, and others. Search here for companies, people, meetings, emails and what the CRM remembers.";

// Read-only tools run freely, and so does saving a memory (as before); anything else (send,
// delete, update, forget) asks the user first.
const approval = ({
  toolName,
  toolAnnotations,
}: {
  toolName: string;
  toolAnnotations?: { readOnlyHint?: boolean };
}) =>
  toolAnnotations?.readOnlyHint === true || toolName.endsWith("crm__remember")
    ? "not-applicable"
    : "user-approval";

/**
 * The apps the user connected in Personal settings → Connections (Granola, Superhuman, …),
 * through the CRM's MCP gateway. Tools are named `connections__<app>__<tool>` and already
 * limited to the access the user chose. A chat from the CRM carries its workspace, so the
 * connection uses a token the agent signs for that user and workspace and needs no sign-in
 * (ADR 0018). Other callers sign the agent in to the CRM once (ADR 0013). The file name must
 * stay `connections`: the CRM accepts this agent's sign-in callback only under
 * `/eve/v1/connections/connections/callback/`.
 */
export default defineDynamic((ctx) => {
  const caller = crmCaller(ctx.session.auth.current);

  if (caller?.workspaceId) {
    return defineMcpClientConnection({
      url: gatewayUrl,
      description,
      // One tool list per workspace: the connections differ by workspace.
      instanceKey: caller.workspaceId,
      auth: {
        principalType: "user",
        getToken: async () => {
          const token = await crmToken(caller);

          if (!token) throw new Error("The CRM token could not be made");

          return { token };
        },
      },
      approval,
    });
  }

  return defineMcpClientConnection({
    url: gatewayUrl,
    description,
    // Signed in once per user (ADR 0013); the token names the workspace.
    instanceKey: "crm-sign-in",
    auth: gatewayAuthorization,
    approval,
  });
});
