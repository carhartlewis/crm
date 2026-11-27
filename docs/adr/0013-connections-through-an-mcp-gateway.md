# 0013: Connections reach the agent through an MCP gateway

**Status:** accepted (2026-11)

## Context

Users connect their own apps (Granola, Superhuman, and more later) so the agent can use them, as in Claude Desktop or ChatGPT. Each app is a remote MCP server with its own OAuth. We want to add an app without writing per-app code or per-app permission lists, and the user should only choose read or write.

## Decision

- **`@crm/integrations` holds the catalog and everything generic.** An app is one catalog entry: id, name, domain (its integrations.sh entry), summary, description, MCP URL. Nothing else is per app.
- **OAuth is discovered, not configured.** The MCP SDK's `auth()` finds the authorization server from the MCP URL (RFC 9728, RFC 8414), registers the CRM (a Client ID Metadata Document on a public HTTPS origin, dynamic registration elsewhere), and asks for every scope the server lists plus `offline_access`. So every connection gets the most the server allows.
- **Read or write is applied to tools.** `read` exposes only tools the server marks `readOnlyHint: true`; `write` exposes all. A tool without annotations counts as a write. The gateway checks the annotation again on every call. In the agent, every tool that is not read-only needs the user's approval.
- **Connections belong to a user in a workspace.** Table `connection`, unique on (workspace, user, app). Upstream tokens are encrypted with `BETTER_AUTH_SECRET` and never leave the API.
- **One MCP gateway, guarded by better-auth MCP.** `/api/mcp` is a stateless MCP server that proxies every connected app's tools as `<app>__<tool>`. `@better-auth/mcp` makes the CRM the OAuth 2.1 authorization server for it. Its only client is the agent (`crm-agent`), registered by the API at startup with consent skipped; dynamic registration and CIMD stay off. A token is bound to the workspace that was active when the user authorized it (`workspace_id` claim).
- **The agent signs in once.** The eve connection `connections` uses interactive authorization against the CRM, keeps the token per user in Redis, and renews it with the refresh token. The CRM accepts the agent's redirect only under `/eve/v1/connections/connections/callback/`.
- **The app's OAuth callback trusts `state`.** It is single-use and expires in 10 minutes. A signed-in browser must be the user who started; a signed-out browser (the desktop app's system browser) is told to go back to the app.

## Consequences

- Adding an app is one catalog entry, if the app has a remote MCP server with standard MCP OAuth.
- An app that does not annotate its tools has no tools at `read`.
- The gateway discovery documents are at the origin root (`/.well-known/oauth-protected-resource/api/mcp`, `/.well-known/oauth-authorization-server/api/auth`). A production proxy in front of the API must forward them as well as `/api/*`.
- The agent uses node-redis, not Bun's client, because eve bundles it for Node.
- If the user changes workspace, the agent's token keeps the workspace it was authorized in until the user signs in to the gateway again.

## Addendum: workspace skills (2026-11)

- **Skills are shared per workspace.** Table `skill`. Any member can add, enable, disable or remove one. Personal skills are not built yet.
- **skills.sh is the catalog.** `@crm/integrations/skills-sh` searches it and fetches a skill's package. The API stores a pinned copy (SKILL.md body plus its other text files, at most 1 MB and 200 files, paths kept inside the skill folder). Updates on skills.sh do not change the copy.
- **A new skill starts disabled.** Someone reads it in the CRM, then enables it. A skill is third-party text that steers the agent, so nobody turns one on without seeing it.
- **The agent loads enabled skills each turn** (`agent/skills/workspace.ts`, eve `defineDynamic`) from `GET /api/agent/skills`, with the same better-auth MCP token as the gateway. Skills appear after the user has signed the agent in to the CRM once.

## Addendum: custom connectors (2026-11)

- **A workspace can add any remote MCP server by URL** (table `custom_connector`). Any member can add or remove one; each person still connects on their own. It joins the catalog for that workspace, so OAuth, the gateway and the read/write policy treat it like a built-in app.
- **The server must offer MCP OAuth.** The API checks for RFC 9728 metadata and an authorization server before it saves the connector.
- **Requests to app servers reach public addresses only.** URLs must be https on a public hostname, and every request resolves the host first and refuses loopback, private, link-local and other non-public addresses; redirects are not followed. A short DNS-rebinding window remains.
- **Removing a custom connector removes everyone's connection to it.**
