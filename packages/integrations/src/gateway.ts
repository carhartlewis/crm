import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolRequestParams,
  type FetchLike,
  type OAuthClientProvider,
  type StreamableHTTPClientTransportOptions,
  type Tool,
} from "@modelcontextprotocol/client";
import { createMcpHandler, Server, type CallToolResult } from "@modelcontextprotocol/server";
import { allowsTool, type Access } from "./access.ts";
import type { Integration } from "./catalog.ts";

/**
 * Server-only. One MCP server in front of a user's connections. The agent connects to this
 * gateway, not to each app: it sees every connected app's tools as `<integration>__<tool>`,
 * already narrowed to the access level the user chose, and the upstream tokens never leave the
 * API. Authenticating the caller is the host's job (better-auth's `requireMcpAuth`); the host
 * passes the verified principal to `fetch`.
 */

export interface GatewayConnection {
  readonly integration: Integration;
  readonly access: Access;
  /** Token source for the upstream server (`connectionAuth` from `./oauth`). */
  readonly auth: OAuthClientProvider;
}

export interface GatewayOptions<Principal> {
  /** The caller's connections, read once per MCP request. */
  readonly connections: (principal: Principal) => Promise<readonly GatewayConnection[]>;
  readonly fetch?: FetchLike;
  /** Upstream failures; the gateway leaves the app's tools out (list) or returns a tool error (call). */
  readonly onError?: (cause: unknown, integration: string) => void;
}

export interface Gateway<Principal> {
  readonly fetch: (request: Request, principal: Principal) => Promise<Response>;
  readonly close: () => Promise<void>;
}

const SEPARATOR = "__";

export function toolName(integration: Integration, tool: string) {
  return `${integration.id}${SEPARATOR}${tool}`;
}

function splitToolName(name: string) {
  const at = name.indexOf(SEPARATOR);

  return at > 0
    ? { integration: name.slice(0, at), tool: name.slice(at + SEPARATOR.length) }
    : null;
}

/** The tool under its gateway name; builds a new object so the upstream list stays unchanged. */
function withName(tool: Tool, name: string): Tool {
  return Object.assign({}, tool, { name });
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

async function withUpstream<T>(
  connection: GatewayConnection,
  fetchFn: FetchLike | undefined,
  run: (client: Client) => Promise<T>,
) {
  const client = new Client({ name: "crm-connections", version: "1.0.0" });

  const transportOptions: StreamableHTTPClientTransportOptions = { authProvider: connection.auth };

  if (fetchFn) transportOptions.fetch = fetchFn;

  const transport = new StreamableHTTPClientTransport(
    new URL(connection.integration.mcpUrl),
    transportOptions,
  );

  await client.connect(transport);

  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

async function listAllTools(client: Client) {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor.
    const page = await client.listTools(cursor ? { cursor } : {});

    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return tools;
}

export function createGateway<Principal>(options: GatewayOptions<Principal>): Gateway<Principal> {
  const report = options.onError ?? (() => {});

  const handler = createMcpHandler(async ({ authInfo }) => {
    // Set by `fetch` below from the host's verified token, never from the request.
    // SAFETY: `extra.principal` is only ever written by `fetch` below, with a `Principal`.
    const principal = authInfo?.extra?.["principal"] as Principal | undefined;

    if (principal === undefined) throw new Error("Gateway request without a principal");

    const connections = await options.connections(principal);

    const server = new Server(
      { name: "crm-connections", version: "1.0.0" },
      {
        capabilities: { tools: {} },
        instructions:
          "Tools from the apps this user connected to the CRM, named <app>__<tool>. Each app is read-only or read-write, as the user chose.",
      },
    );

    server.setRequestHandler("tools/list", async () => {
      const lists = await Promise.all(
        connections.map(async (connection) => {
          try {
            const tools = await withUpstream(connection, options.fetch, listAllTools);

            return tools
              .filter((tool) => allowsTool(connection.access, tool.annotations))
              .map((tool) => withName(tool, toolName(connection.integration, tool.name)));
          } catch (error) {
            report(error, connection.integration.id);

            return [];
          }
        }),
      );

      return { tools: lists.flat() };
    });

    server.setRequestHandler("tools/call", async ({ params }) => {
      const target = splitToolName(params.name);

      const connection =
        target && connections.find(({ integration }) => integration.id === target.integration);

      if (!target || !connection) {
        return toolError(`${params.name} is not a tool of a connected app.`);
      }

      const { integration } = connection;

      try {
        return await withUpstream(connection, options.fetch, async (client) => {
          if (connection.access !== "write") {
            // Check the server's own annotation on every call, not only when listing.
            const tool = (await listAllTools(client)).find(({ name }) => name === target.tool);

            if (!tool) return toolError(`${integration.name} has no tool named ${target.tool}.`);

            if (!allowsTool(connection.access, tool.annotations)) {
              return toolError(
                `${integration.name} is connected read-only, so ${target.tool} is not allowed. The user can allow writes on the Connections page.`,
              );
            }
          }

          const request: CallToolRequestParams = { name: target.tool };

          if (params.arguments) request.arguments = params.arguments;

          return await client.callTool(request);
        });
      } catch (error) {
        report(error, integration.id);

        return toolError(
          error instanceof Error && error.name === "ReconnectRequired"
            ? `${integration.name} needs to be connected again on the Connections page.`
            : `${integration.name} could not be reached. Try again later.`,
        );
      }
    });

    return server;
  });

  return {
    fetch: (request, principal) =>
      handler.fetch(request, {
        authInfo: { token: "", clientId: "crm", scopes: [], extra: { principal } },
      }),
    close: () => handler.close(),
  };
}
