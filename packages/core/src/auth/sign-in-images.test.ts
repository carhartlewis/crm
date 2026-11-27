import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, test } from "bun:test";
import { createAuth } from "@crm/core/auth";
import { codeKey, sha256 } from "@crm/core/auth/desktop-handoff";
import { createMemoryKv } from "@crm/core/kv";
import { createImageCache, createMemoryStorage } from "@crm/core/storage";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

const GOOGLE_IMAGE = "https://lh3.googleusercontent.com/a/abc=s96-c";

const verifier = "v".repeat(43);

interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

/** Signs a user in through the real desktop redeem endpoint, which creates a session. */
async function signIn({
  logo,
  image = GOOGLE_IMAGE,
}: {
  logo: string | null;
  image?: string | null;
}) {
  const kv = createMemoryKv();
  const storage = createMemoryStorage();
  const requested: string[] = [];
  const userInfoRequests: (string | null)[] = [];

  const images = createImageCache({
    storage,
    fetch: async (url) => {
      requested.push(url);

      return new Response(PNG);
    },
  });

  const members: Member[] = [];

  const db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    workspace: [
      {
        id: "w1",
        name: "Acme",
        slug: "acme",
        website: "https://acme.com",
        logo,
        createdAt: new Date(),
      },
    ],
    member: members,
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
    kv,
    secret: "test-secret-test-secret-test-secret-0123",
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    google: { clientId: "id", clientSecret: "secret" },
    mcp: {
      resource: "http://localhost:3000/api/mcp",
      loginPage: "http://localhost:3000/sign-in",
      consentPage: "http://localhost:3000/connections",
      agentCallbackPrefix: "http://localhost:2000/eve/v1/connections/connections/callback/",
    },
    images,
    fetch: async (_url, init) => {
      userInfoRequests.push(new Headers(init.headers).get("authorization"));

      return Response.json({ name: "A", picture: GOOGLE_IMAGE });
    },
  });

  const context = await auth.$context;

  const user = await context.internalAdapter.createUser(
    { email: "a@example.com", name: "A", emailVerified: true, image },
    { method: "admin" },
  );

  await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: "google",
    accountId: "g1",
    accessToken: "google-access-token",
  });

  members.push({
    id: "m1",
    organizationId: "w1",
    userId: user.id,
    role: "owner",
    createdAt: new Date(),
  });

  const code = "c".repeat(43);

  await kv.set(
    codeKey(await sha256(code)),
    JSON.stringify({ userId: user.id, challenge: await sha256(verifier) }),
    120,
  );

  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/desktop/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ code, verifier }),
    }),
  );

  expect(response.status).toBe(200);

  return {
    user: await context.internalAdapter.findUserById(user.id),
    workspace: db.workspace[0],
    storage,
    requested,
    userInfoRequests,
  };
}

describe("sign-in images", () => {
  test("copies the Google avatar and the workspace favicon into storage", async () => {
    const { user, workspace, storage } = await signIn({ logo: null });

    expect(user?.image).toMatch(/^memory:\/\/storage\/users\/.+\/avatar\?v=[0-9a-f]{16}$/);
    expect(workspace?.logo).toStartWith("memory://storage/favicons/acme.com?v=");
    expect(storage.read("favicons/acme.com")?.contentType).toBe("image/png");
  });

  test("asks Google's userinfo for the picture when the ID token had none", async () => {
    const { user, requested, userInfoRequests } = await signIn({ logo: null, image: null });

    expect(userInfoRequests).toEqual(["Bearer google-access-token"]);
    expect(requested).toContain("https://lh3.googleusercontent.com/a/abc=s256-c");
    expect(user?.image).toMatch(/^memory:\/\/storage\/users\/.+\/avatar\?v=[0-9a-f]{16}$/);
  });

  test("doesn't call userinfo when the user already has a picture", async () => {
    const { userInfoRequests } = await signIn({ logo: null });

    expect(userInfoRequests).toEqual([]);
  });

  test("keeps a workspace logo that is already set", async () => {
    const { workspace, requested } = await signIn({ logo: "https://acme.com/logo.png" });

    expect(workspace?.logo).toBe("https://acme.com/logo.png");
    expect(requested.some((url) => url.includes("s2/favicons"))).toBe(false);
  });
});
