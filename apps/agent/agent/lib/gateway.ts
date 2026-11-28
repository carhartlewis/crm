import { gatewayAuth } from "./gateway-auth.ts";
import { createNodeRedisKv } from "./redis-kv.ts";

export const apiUrl = process.env["CRM_API_URL"] ?? "http://localhost:3001";

/** The CRM's MCP gateway, and the per-user sign-in shared by the connection and the skills. */
export const gatewayUrl = new URL("/api/mcp", apiUrl).href;

export const agentSkillsUrl = new URL("/api/agent/skills", apiUrl).href;

export const agentContextUrl = new URL("/api/agent/context", apiUrl).href;

export const gatewayAuthorization = gatewayAuth({
  gatewayUrl,
  kv: createNodeRedisKv(process.env["REDIS_URL"] ?? "redis://localhost:56379", "crm"),
});
