import { defineMemory } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";
import { crmMemory } from "../lib/crm-memory.ts";
import { crmToken } from "../lib/crm-token.ts";
import { apiUrl } from "../lib/gateway.ts";
import { gatewayJev } from "../lib/jev-gateway.ts";
import { crmMemoryProvider } from "../lib/memory-provider.ts";

/**
 * What the CRM remembers (ADR 0014): the member's own company and every company in the CRM.
 * Stored in Supermemory behind the CRM API, reached with the same token as the connections
 * gateway: for a chat from the CRM, one the agent signs for the chat's workspace (ADR 0018).
 */
export default defineMemory({
  description:
    "CRM memory: lasting facts about the member's own company and the companies in their CRM, from website research, members' notes, and what Jev kept from chats and sent emails.",
  provider: crmMemoryProvider({
    memoryFor: (caller) => crmMemory({ apiUrl, token: () => crmToken(caller) }),
    // Jev runs on the Vercel AI Gateway and alone decides what a chat adds; without a key, nothing.
    jev:
      process.env["AI_GATEWAY_API_KEY"] || process.env["VERCEL_OIDC_TOKEN"] ? gatewayJev() : null,
  }),
  scope: byPrincipal,
});
