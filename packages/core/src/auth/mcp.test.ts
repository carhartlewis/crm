import { requireMcpAuth } from "@better-auth/mcp";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, test } from "bun:test";
import { createAuth } from "@crm/core/auth";
import {
  AGENT_CLIENT_ID,
  matchesRedirect,
  registerAgentClient,
  WORKSPACE_CLAIM,
} from "@crm/core/auth/mcp";
import { createMemoryKv } from "@crm/core/kv";
import { Schema } from "effect";

const origin = "http://localhost:3000";
const secret = "test-secret-test-secret-test-secret-0123";
const resource = `${origin}/api/mcp`;
const callbackPrefix = "http://localhost:3002/eve/v1/connections/connections/callback/";
const callback = `${callbackPrefix}attempt-1/token-1`;

const decodeTokens = Schema.decodeUnknownSync(
  Schema.Struct({ access_token: Schema.String, refresh_token: Schema.optional(Schema.String) }),
);

const decodeClaims = Schema.decodeUnknownSync(
  Schema.Struct({ sub: Schema.String, [WORKSPACE_CLAIM]: Schema.String }),
);

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

async function pkce() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

async function setup() {
  const db = {
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
  };

  const auth = createAuth({
    database: memoryAdapter(db),
    kv: createMemoryKv(),
    secret,
    baseURL: origin,
    trustedOrigins: [origin],
    google: { clientId: "id", clientSecret: "secret" },
    mcp: {
      resource,
      loginPage: `${origin}/sign-in`,
      consentPage: `${origin}/connections`,
      agentCallbackPrefix: callbackPrefix,
    },
  });

  const context = await auth.$context;
  const now = new Date();

  await registerAgentClient(context.adapter, {
    resource,
    agentCallbackPrefix: callbackPrefix,
  });
  // Running it again (every API start) must not fail or duplicate rows.
  await registerAgentClient(context.adapter, {
    resource,
    agentCallbackPrefix: callbackPrefix,
  });

  const user = await context.internalAdapter.createUser(
    { email: "a@example.com", name: "A", emailVerified: true },
    { method: "admin" },
  );

  await context.adapter.create({
    model: "workspace",
    data: { id: "ws-1", name: "Acme", slug: "acme", website: "https://acme.test", createdAt: now },
    forceAllowId: true,
  });
  await context.adapter.create({
    model: "member",
    data: { organizationId: "ws-1", userId: user.id, role: "owner", createdAt: now },
  });

  const session = await context.internalAdapter.createSession(user.id, false, {
    activeOrganizationId: "ws-1",
  });

  const cookie = `better-auth.session_token=${await sign(session.token)}`;

  return { auth, cookie, user };
}

async function authorize(
  auth: Awaited<ReturnType<typeof setup>>["auth"],
  cookie: string,
  redirectUri = callback,
) {
  const { verifier, challenge } = await pkce();
  const url = new URL(`${origin}/api/auth/oauth2/authorize`);

  url.search = new URLSearchParams({
    response_type: "code",
    client_id: AGENT_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid offline_access",
    state: "state-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  }).toString();

  const response = await auth.handler(new Request(url, { headers: { cookie } }));

  return { response, verifier };
}

describe("MCP authorization for the agent", () => {
  test("a signed-in user gets a gateway token bound to their workspace, without consent", async () => {
    const { auth, cookie, user } = await setup();
    const { response, verifier } = await authorize(auth, cookie);

    const location = new URL(response.headers.get("location") ?? "");

    expect(location.href.startsWith(callback)).toBe(true);
    expect(location.searchParams.get("state")).toBe("state-1");

    const code = location.searchParams.get("code") ?? "";

    const tokenResponse = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: callback,
          client_id: AGENT_CLIENT_ID,
          resource,
        }),
      }),
    );

    expect(tokenResponse.status).toBe(200);

    const tokens = decodeTokens(await tokenResponse.json());

    expect(tokens.refresh_token).toBeString();

    const protectedRoute = requireMcpAuth(auth, (_request, claims) => Response.json(claims), {
      resource,
    });

    const claims = decodeClaims(
      await (
        await protectedRoute(
          new Request(resource, {
            method: "POST",
            headers: { authorization: `Bearer ${tokens.access_token}` },
          }),
        )
      ).json(),
    );

    expect(claims.sub).toBe(user.id);
    expect(claims[WORKSPACE_CLAIM]).toBe("ws-1");
  });

  test("refuses a redirect outside the agent's callback path", async () => {
    const { auth, cookie } = await setup();
    const { response } = await authorize(auth, cookie, "http://localhost:3002/elsewhere");

    expect(response.headers.get("location") ?? "").not.toStartWith(
      "http://localhost:3002/elsewhere",
    );
  });

  test("the gateway answers a request without a token with an RFC 9728 challenge", async () => {
    const { auth } = await setup();
    const protectedRoute = requireMcpAuth(auth, () => new Response("ok"), { resource });

    const response = await protectedRoute(new Request(resource, { method: "POST" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });
});

describe("matchesRedirect", () => {
  test("allows paths below a registered /callback/ prefix on the same origin", () => {
    expect(matchesRedirect(callback, [callbackPrefix])).toBe(true);
    expect(matchesRedirect(callbackPrefix, [callbackPrefix])).toBe(true);
  });

  test("refuses other origins, dot segments, and the bare prefix's parent", () => {
    expect(
      matchesRedirect("http://evil.test/eve/v1/connections/connections/callback/x", [
        callbackPrefix,
      ]),
    ).toBe(false);
    expect(matchesRedirect(`${callbackPrefix}../../../../steal`, [callbackPrefix])).toBe(false);
    expect(
      matchesRedirect("http://localhost:3002/eve/v1/connections/connections/", [callbackPrefix]),
    ).toBe(false);
    expect(
      matchesRedirect("http://user@localhost:3002/eve/v1/connections/connections/callback/x", [
        callbackPrefix,
      ]),
    ).toBe(false);
  });

  test("never treats an ordinary registered URI as a prefix", () => {
    expect(matchesRedirect("https://app.test/cb/more", ["https://app.test/cb"])).toBe(false);
  });
});
