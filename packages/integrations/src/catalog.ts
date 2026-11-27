/**
 * The apps a user can connect. Each one is a remote MCP server that authorizes with standard
 * MCP OAuth (RFC 9728 discovery, PKCE, then a Client ID Metadata Document or dynamic client
 * registration). Nothing here is per-app: scopes, endpoints and client registration are
 * discovered from `mcpUrl` at connect time, and the read/write choice is applied to the tools
 * the server publishes (see `access.ts`).
 *
 * To add an app, add one entry; its logo comes from context.dev by `domain`. Remote MCP servers are listed at https://integrations.sh/?kind=mcp.
 */
export interface Integration {
  /**
   * Stable id, stored on each connection. Also the tool prefix the agent sees, such as
   * `granola__list_meetings`, so use lowercase letters, digits and `-` only.
   */
  readonly id: string;
  readonly name: string;
  /** Who publishes the MCP server, shown as "by <vendor>". */
  readonly vendor: string;
  /**
   * The vendor's domain. `https://integrations.sh/<domain>/` is its directory entry, and its
   * logo comes from context.dev by this domain.
   */
  readonly domain: string;
  /** One line for people choosing what to connect. */
  readonly summary: string;
  /** What the server gives the agent. The model reads it to decide which tools to search. */
  readonly description: string;
  /** Streamable HTTP endpoint. */
  readonly mcpUrl: string;
}

export const integrations = [
  {
    id: "granola",
    name: "Granola",
    vendor: "Granola",
    domain: "granola.ai",
    summary: "Meeting notes and transcripts.",
    description:
      "Granola meeting notes: search meetings by person, company, topic or date, and read their notes, summaries and transcripts.",
    mcpUrl: "https://mcp.granola.ai/mcp",
  },
  {
    id: "superhuman",
    name: "Superhuman",
    vendor: "Superhuman",
    domain: "superhuman.com",
    summary: "Email: search, read, draft and send.",
    description:
      "The user's Superhuman mailbox: search and read email threads, and draft, reply to or send messages.",
    mcpUrl: "https://mcp.mail.superhuman.com/mcp",
  },
] as const satisfies readonly Integration[];

export type IntegrationId = (typeof integrations)[number]["id"];

const byId = new Map<string, Integration>(integrations.map((entry) => [entry.id, entry]));

export function integrationById(id: string): Integration | undefined {
  return byId.get(id);
}

export function isIntegrationId(value: string): value is IntegrationId {
  return byId.has(value);
}

/** The directory entry for an integration on integrations.sh. */
export function directoryUrl(integration: Integration) {
  return `https://integrations.sh/${integration.domain}/`;
}
