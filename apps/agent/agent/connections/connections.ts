import { defineMcpClientConnection } from "eve/connections";
import { gatewayAuthorization, gatewayUrl } from "../lib/gateway.ts";

/**
 * The apps the user connected on the Connections page (Granola, Superhuman, …), through the
 * CRM's MCP gateway. Tools are named `connections__<app>__<tool>` and already limited to the
 * access the user chose. The file name must stay `connections`: the CRM accepts this agent's
 * sign-in callback only under `/eve/v1/connections/connections/callback/`.
 */
export default defineMcpClientConnection({
  url: gatewayUrl,
  description:
    "Apps the user connected to the CRM: Granola meeting notes and transcripts, Superhuman email, and others. Search here for meetings, emails and other context about people and companies.",
  auth: gatewayAuthorization,
  // Read-only tools run freely; anything else (send, delete, update) asks the user first.
  approval: ({ toolAnnotations }) =>
    toolAnnotations?.readOnlyHint === true ? "not-applicable" : "user-approval",
});
