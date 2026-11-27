import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Integration } from "./catalog.ts";

/**
 * Tests only (`@crm/integrations/testing`). Test double for a third-party app: an MCP server that requires a bearer token, its RFC 9728
 * metadata, and an OAuth authorization server with dynamic registration and CIMD. Served
 * through `fetch`, so tests run without a network.
 */
export const fakeIntegration: Integration = {
  id: "notes",
  name: "Notes",
  vendor: "Notes",
  domain: "notes.example",
  summary: "Notes.",
  description: "Notes.",
  mcpUrl: "https://mcp.notes.example/mcp",
};

const issuer = "https://auth.notes.example";

/** A dynamic client registration request: any JSON object. */
const Registration = z.record(z.string(), z.json());

type Registration = z.infer<typeof Registration>;

function json(body: z.infer<ReturnType<typeof z.json>>, status = 200) {
  return Response.json(body, { status });
}

/** `mcpUrl` is where the fake answers: `fakeIntegration`'s by default, or a catalog entry's. */
export function fakeUpstream(mcpUrl = fakeIntegration.mcpUrl) {
  const upstreamUrl = new URL(mcpUrl);

  const calls: string[] = [];
  const registrations: Registration[] = [];
  const tokenRequests: URLSearchParams[] = [];
  let validToken = "access-1";

  const mcp = createMcpHandler(() => {
    const server = new McpServer({ name: "notes", version: "1.0.0" });

    server.registerTool(
      "search_notes",
      {
        description: "Search notes.",
        inputSchema: z.object({ query: z.string() }),
        annotations: { readOnlyHint: true },
      },
      async ({ query }) => {
        calls.push(`search_notes:${query}`);

        return { content: [{ type: "text", text: `found ${query}` }] };
      },
    );

    server.registerTool(
      "delete_note",
      { description: "Delete a note.", inputSchema: z.object({ id: z.string() }) },
      async ({ id }) => {
        calls.push(`delete_note:${id}`);

        return { content: [{ type: "text", text: `deleted ${id}` }] };
      },
    );

    return server;
  });

  const fetch = async (input: string | URL, init?: ConstructorParameters<typeof Request>[1]) => {
    const request = new Request(input.toString(), init);
    const url = new URL(request.url);

    if (url.origin === upstreamUrl.origin) {
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
        return json({
          resource: mcpUrl,
          authorization_servers: [issuer],
          scopes_supported: ["notes.read", "notes.write"],
        });
      }

      if (request.headers.get("authorization") !== `Bearer ${validToken}`) {
        return new Response(null, {
          status: 401,
          headers: {
            "www-authenticate": `Bearer resource_metadata="${upstreamUrl.origin}/.well-known/oauth-protected-resource${upstreamUrl.pathname}"`,
          },
        });
      }

      return mcp.fetch(request);
    }

    if (url.origin === issuer) {
      if (url.pathname === "/.well-known/oauth-authorization-server") {
        return json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          scopes_supported: ["openid", "offline_access"],
          client_id_metadata_document_supported: true,
          token_endpoint_auth_methods_supported: ["none"],
        });
      }

      if (url.pathname === "/register") {
        const metadata = Registration.parse(await request.json());

        registrations.push(metadata);

        return json({ ...metadata, client_id: "registered-client" }, 201);
      }

      if (url.pathname === "/token") {
        const params = new URLSearchParams(await request.text());

        tokenRequests.push(params);

        const valid =
          (params.get("grant_type") === "authorization_code" && params.get("code") === "good") ||
          (params.get("grant_type") === "refresh_token" &&
            params.get("refresh_token") === "refresh-1");

        if (!valid) return json({ error: "invalid_grant" }, 400);

        return json({
          access_token: validToken,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "refresh-1",
        });
      }
    }

    return new Response("not found", { status: 404 });
  };

  return {
    fetch,
    calls,
    registrations,
    tokenRequests,
    /** Rotate the accepted token, as if the old one expired. */
    rotateToken(token: string) {
      validToken = token;
    },
  };
}
