import { describe, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Access } from "./access.ts";
import { fakeIntegration, fakeUpstream } from "./fake-upstream.ts";
import { createGateway } from "./gateway.ts";
import { connectionAuth, type Credentials } from "./oauth.ts";

const config = { redirectUrl: "https://crm.example/api/connections/callback", clientName: "CRM" };

const issuer = "https://auth.notes.example";

const signedIn: Credentials = {
  client: { client_id: "registered-client", issuer },
  tokens: { access_token: "access-1", token_type: "Bearer", refresh_token: "refresh-1", issuer },
};

function setup(access: Access, credentials: Credentials = signedIn, withLocal = false) {
  const upstream = fakeUpstream();
  const errors: string[] = [];
  const saved: Credentials[] = [];

  const gateway = createGateway<{ userId: string }>({
    fetch: upstream.fetch,
    local: ({ userId }) =>
      withLocal
        ? [
            {
              tool: {
                name: "crm__whoami",
                description: "The caller.",
                inputSchema: { type: "object" },
                annotations: { readOnlyHint: true },
              },
              call: async () => ({ content: [{ type: "text", text: userId }] }),
            },
          ]
        : [],
    onError: (_error, integration) => errors.push(integration),
    connections: async ({ userId }) =>
      userId === "user-1"
        ? [
            {
              integration: fakeIntegration,
              access,
              auth: connectionAuth(
                fakeIntegration,
                { ...config, fetch: upstream.fetch },
                credentials,
                async (next) => {
                  saved.push(next);
                },
              ),
            },
          ]
        : [],
  });

  async function connect(userId = "user-1") {
    const client = new Client({ name: "agent", version: "1.0.0" });

    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://crm.example/api/mcp"), {
        fetch: (input, init) => gateway.fetch(new Request(input, init), { userId }),
      }),
    );

    return client;
  }

  return { upstream, errors, saved, connect };
}

describe("gateway", () => {
  test("read access lists only the server's read-only tools, prefixed with the app", async () => {
    const { connect } = setup("read");
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(["notes__search_notes"]);
  });

  test("write access lists every tool", async () => {
    const { connect } = setup("write");
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
      "notes__delete_note",
      "notes__search_notes",
    ]);
  });

  test("calls the upstream tool with the caller's arguments", async () => {
    const { connect, upstream } = setup("read");
    const client = await connect();

    const result = await client.callTool({
      name: "notes__search_notes",
      arguments: { query: "acme" },
    });

    expect(result.content).toEqual([{ type: "text", text: "found acme" }]);
    expect(upstream.calls).toEqual(["search_notes:acme"]);
  });

  test("refuses a write tool on a read-only connection without calling it", async () => {
    const { connect, upstream } = setup("read");
    const client = await connect();

    const result = await client.callTool({ name: "notes__delete_note", arguments: { id: "1" } });

    expect(result.isError).toBe(true);
    expect(upstream.calls).toEqual([]);
  });

  test("shows a caller nothing from another user's connections", async () => {
    const { connect } = setup("write");
    const client = await connect("user-2");

    expect((await client.listTools()).tools).toEqual([]);
  });

  test("refreshes an expired token and saves the new one", async () => {
    const { connect, saved, upstream } = setup("read", {
      ...signedIn,
      tokens: { access_token: "expired", token_type: "Bearer", refresh_token: "refresh-1", issuer },
    });

    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(upstream.tokenRequests.map((params) => params.get("grant_type"))).toEqual([
      "refresh_token",
    ]);
    expect(saved.at(-1)?.tokens?.access_token).toBe("access-1");
  });

  test("leaves out an app whose grant is gone, and says to reconnect on a call", async () => {
    const { connect, errors } = setup("read", {
      ...signedIn,
      tokens: { access_token: "expired", token_type: "Bearer", refresh_token: "revoked", issuer },
    });

    const client = await connect();

    expect((await client.listTools()).tools).toEqual([]);
    expect(errors).toEqual(["notes"]);

    const result = await client.callTool({
      name: "notes__search_notes",
      arguments: { query: "a" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("connected again");
  });

  test("lists the host's own tools first and runs them as the caller", async () => {
    const client = await setup("read", signedIn, true).connect("user-2");
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(["crm__whoami"]);
    expect(await client.callTool({ name: "crm__whoami" })).toMatchObject({
      content: [{ type: "text", text: "user-2" }],
    });
  });
});
