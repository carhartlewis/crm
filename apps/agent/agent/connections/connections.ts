import { defineMcpClientConnection } from "eve/connections";
import { gatewayAuth } from "../lib/gateway-auth.ts";
import { createNodeRedisKv } from "../lib/redis-kv.ts";

const apiUrl = process.env["CRM_API_URL"] ?? "http://localhost:3001";

const auth = gatewayAuth({
  gatewayUrl: new URL("/api/mcp", apiUrl).href,
  kv: createNodeRedisKv(process.env["REDIS_URL"] ?? "redis://localhost:56379", "crm"),
});

/**
 * The apps the user connected on the Connections page (Granola, Superhuman, …), through the
 * CRM's MCP gateway. Tools are named `connections__<app>__<tool>` and already limited to the
 * access the user chose. The file name must stay `connections`: the CRM accepts this agent's
 * sign-in callback only under `/eve/v1/connections/connections/callback/`.
 */
export default defineMcpClientConnection({
  url: new URL("/api/mcp", apiUrl).href,
  description:
    "Apps the user connected to the CRM: Granola meeting notes and transcripts, Superhuman email, and others. Search here for meetings, emails and other context about people and companies.",
  auth,
  // Read-only tools run freely; anything else (send, delete, update) asks the user first.
  approval: ({ toolAnnotations }) =>
    toolAnnotations?.readOnlyHint === true ? "not-applicable" : "user-approval",
});
