import { isConnectionAuthorizationRequiredError } from "eve/connections";
import { defineMemory } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";
import { crmMemory } from "../lib/crm-memory.ts";
import { apiUrl, gatewayAuthorization, gatewayUrl } from "../lib/gateway.ts";
import { gatewayJev } from "../lib/jev-gateway.ts";
import { crmMemoryProvider } from "../lib/memory-provider.ts";

/**
 * What the CRM remembers (ADR 0014): the member's own company and every company in the CRM.
 * Stored in Supermemory behind the CRM API, reached with the same per-user token as the
 * connections gateway, so memory starts once the user has signed the assistant in to the CRM.
 */
export default defineMemory({
  description:
    "CRM memory: lasting facts about the member's own company and the companies in their CRM, from website research, members' notes, past chats and sent emails.",
  provider: crmMemoryProvider({
    memoryFor: (userId) =>
      crmMemory({
        apiUrl,
        token: async () => {
          try {
            const { token } = await gatewayAuthorization.getToken({
              principal: { type: "user", id: userId },
              connection: { url: gatewayUrl },
            });

            return token;
          } catch (error) {
            if (isConnectionAuthorizationRequiredError(error)) return null;

            throw error;
          }
        },
      }),
    // Jev runs on the Vercel AI Gateway; without a key, chats are saved but not judged.
    jev:
      process.env["AI_GATEWAY_API_KEY"] || process.env["VERCEL_OIDC_TOKEN"] ? gatewayJev() : null,
  }),
  scope: byPrincipal,
});
