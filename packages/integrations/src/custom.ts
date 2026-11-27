import { integrationById, type Integration } from "./catalog.ts";

/**
 * Client-safe rules for custom connectors: any remote MCP server a workspace adds by URL. It
 * behaves like a catalog app (same OAuth, same read/write policy); only its entry comes from the
 * workspace instead of `catalog.ts`.
 */

const NAME_MAX = 40;

export function connectorNameError(value: string) {
  const name = value.trim();

  if (name === "") return "Give the connector a name";

  if (name.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters`;

  if (connectorKey(name) === "") return "Use at least one letter or number";

  if (integrationById(connectorKey(name))) return "There is already a connector with this name";

  return undefined;
}

const BLOCKED_HOSTS = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home$)/;

/** A bare IPv4 or IPv6 address, which we never accept: only public hostnames. */
const IP_ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

export function connectorUrlError(value: string) {
  const text = value.trim();

  if (text === "") return "Enter the server's MCP URL";

  if (!URL.canParse(text)) return "Enter a full URL, such as https://mcp.example.com/mcp";

  const url = new URL(text);

  if (url.protocol !== "https:") return "Use an https URL";

  if (url.username || url.password) return "Leave credentials out of the URL";

  const host = url.hostname.toLowerCase();

  if (IP_ADDRESS.test(host) || BLOCKED_HOSTS.test(host) || !host.includes(".")) {
    return "Use the server's public hostname";
  }

  return undefined;
}

/** The connector's id: also its tool prefix (`<key>__<tool>`) and its key in the workspace. */
export function connectorKey(name: string) {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, NAME_MAX)
    .replace(/-+$/, "");
}

/** The domain a logo is looked up by: `mcp.linear.app` → `linear.app`. */
export function connectorDomain(mcpUrl: string) {
  const host = new URL(mcpUrl).hostname.toLowerCase();
  const parts = host.split(".");

  return parts.length > 2 && ["mcp", "api", "server", "www"].includes(parts[0] ?? "")
    ? parts.slice(1).join(".")
    : host;
}

/** A custom connector as an `Integration`, so OAuth, the gateway and the UI treat it the same. */
export function customIntegration(entry: {
  key: string;
  name: string;
  mcpUrl: string;
}): Integration {
  const domain = connectorDomain(entry.mcpUrl);

  return {
    id: entry.key,
    name: entry.name,
    vendor: domain,
    domain,
    summary: "Custom connector",
    description: `${entry.name}: an MCP server this workspace added.`,
    mcpUrl: entry.mcpUrl,
  };
}
