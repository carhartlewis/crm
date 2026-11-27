import { describe, expect, test } from "bun:test";
import { createAuth } from "@crm/core/auth";
import { registerAgentClient } from "@crm/core/auth/mcp";
import { createMemoryKv } from "@crm/core/kv";
import { memoryAdapter } from "better-auth/adapters/memory";
import { type ConnectionPrincipal, isConnectionAuthorizationRequiredError } from "eve/connections";
import { gatewayAuth } from "./gateway-auth.ts";

const origin = "http://localhost:3999";
const secret = "test-secret-test-secret-test-secret-0123";
const gatewayUrl = `${origin}/api/mcp`;
const callbackPrefix = "http://localhost:2999/eve/v1/connections/connections/callback/";
const callbackUrl = `${callbackPrefix}attempt-1/token-1`;
const principal = { type: "user", id: "" } satisfies ConnectionPrincipal;
const connection = { url: gatewayUrl };

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return encodeURIComponent(`${value}.${Buffer.from(signature).toString("base64")}`);
}

/** A real better-auth MCP authorization server in memory, and a user signed in to the CRM. */
async function setup() {
  const auth = createAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      workspace: [],
      member: [],
      invitation: [],
      jwks: [],
      oauthClient: [],
      oauthResource: [],
      oauthClientResource: [],
      oauthRefreshToken: [],
      oauthAccessToken: [],
      oauthConsent: [],
      oauthClientAssertion: [],
    }),
    kv: createMemoryKv(),
    secret,
    baseURL: origin,
    trustedOrigins: [origin],
    google: { clientId: "id", clientSecret: "secret" },
    mcp: {
      resource: gatewayUrl,
      loginPage: `${origin}/sign-in`,
      consentPage: `${origin}/connections`,
      agentCallbackPrefix: callbackPrefix,
    },
  });

  const context = await auth.$context;

  await registerAgentClient(context.adapter, {
    resource: gatewayUrl,
    agentCallbackPrefix: callbackPrefix,
  });

  const user = await context.internalAdapter.createUser(
    { email: "a@example.com", name: "A", emailVerified: true },
    { method: "admin" },
  );

  const session = await context.internalAdapter.createSession(user.id, false, {
    activeOrganizationId: "ws-1",
  });

  const cookie = `better-auth.session_token=${await sign(session.token)}`;
  let now = Date.now();

  const kv = createMemoryKv(() => now);

  const agent = gatewayAuth({
    gatewayUrl,
    kv,
    now: () => now,
    fetch: (url, init) => auth.handler(new Request(url, init)),
  });

  const me = { ...principal, id: user.id };

  /** The user's browser: follows the authorization URL with their CRM cookie. */
  async function approve(url: string) {
    const response = await auth.handler(new Request(url, { headers: { cookie } }));

    return new URL(response.headers.get("location") ?? "");
  }

  return {
    agent,
    me,
    approve,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function signIn({ agent, me, approve }: Awaited<ReturnType<typeof setup>>) {
  const started = await agent.startAuthorization({ principal: me, connection, callbackUrl });
  const redirect = await approve(started.challenge.url ?? "");

  return agent.completeAuthorization({
    principal: me,
    connection,
    callbackUrl,
    resume: started.resume,
    callback: { method: "GET", params: Object.fromEntries(redirect.searchParams) },
  });
}

describe("gateway sign-in", () => {
  test("asks the user to sign in when it has no token", async () => {
    const { agent, me } = await setup();

    const error = await agent.getToken({ principal: me, connection }).catch((caught) => caught);

    expect(isConnectionAuthorizationRequiredError(error)).toBe(true);
  });

  test("signs in through the CRM as crm-agent and keeps the token for later turns", async () => {
    const world = await setup();

    const started = await world.agent.startAuthorization({
      principal: world.me,
      connection,
      callbackUrl,
    });

    const url = new URL(started.challenge.url ?? "");

    expect(url.origin + url.pathname).toBe(`${origin}/api/auth/oauth2/authorize`);
    expect(url.searchParams.get("client_id")).toBe("crm-agent");
    expect(url.searchParams.get("resource")).toBe(gatewayUrl);

    const result = await signIn(world);
    const later = await world.agent.getToken({ principal: world.me, connection });

    expect(result.token).toBeString();
    expect(later.token).toBe(result.token);
  });

  test("renews an expired token with the refresh token", async () => {
    const world = await setup();
    const first = await signIn(world);

    world.advance(2 * 60 * 60 * 1000);

    const renewed = await world.agent.getToken({ principal: world.me, connection });

    expect(renewed.token).not.toBe(first.token);
    expect(renewed.expiresAt).toBeGreaterThan(Date.now());
  });

  test("rejects a callback whose state does not match", async () => {
    const { agent, me, approve } = await setup();
    const started = await agent.startAuthorization({ principal: me, connection, callbackUrl });
    const redirect = await approve(started.challenge.url ?? "");

    redirect.searchParams.set("state", "forged");

    await expect(
      agent.completeAuthorization({
        principal: me,
        connection,
        callbackUrl,
        resume: started.resume,
        callback: { method: "GET", params: Object.fromEntries(redirect.searchParams) },
      }),
    ).rejects.toThrow();
  });
});
