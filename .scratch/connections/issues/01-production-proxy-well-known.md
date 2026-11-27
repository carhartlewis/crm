# Forward the gateway's discovery documents in production

Status: open

The web app proxies `/api/*` to crm-api. The MCP discovery documents are at the origin root: `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server/api/auth`. Add both prefixes to the production proxy (and `apps/web/src/dev.ts` if the agent ever talks to the web origin instead of `CRM_API_URL`). Set `AGENT_URL` on crm-api and `REDIS_URL` on the agent.
