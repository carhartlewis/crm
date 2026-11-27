# Connections

Users connect their own apps (MCP servers) so the agent can use them. One access level per connection: read or write. See ADR 0012 for the design.

Shipped: `@crm/integrations` (catalog: Granola, Superhuman; generic MCP OAuth; gateway), the `connection` table, the better-auth MCP authorization server, `/api/mcp`, the Connections page, and the agent's `connections` connection.
