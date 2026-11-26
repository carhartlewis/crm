import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, test } from "bun:test";
import { createAuth } from "@crm/core/auth";
import { codeKey, sha256, verifyPkce } from "@crm/core/auth/desktop-handoff";
import { createMemoryKv } from "@crm/core/kv";

const verifier = "v".repeat(43);

async function setup() {
  const kv = createMemoryKv();

  const auth = createAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      workspace: [],
      member: [],
      invitation: [],
    }),
    kv,
    secret: "test-secret-test-secret-test-secret-0123",
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    google: { clientId: "id", clientSecret: "secret" },
  });

  const context = await auth.$context;

  const user = await context.internalAdapter.createUser(
    {
      email: "a@example.com",
      name: "A",
      emailVerified: true,
    },
    { method: "admin" },
  );

  const code = "c".repeat(43);

  await kv.set(
    codeKey(await sha256(code)),
    JSON.stringify({ userId: user.id, challenge: await sha256(verifier) }),
    120,
  );

  const redeem = (body: { code: string; verifier: string }) =>
    auth.handler(
      new Request("http://localhost:3000/api/auth/desktop/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-crm-client-ip": "203.0.113.9",
        },
        body: JSON.stringify(body),
      }),
    );

  return { auth, user, code, redeem };
}

describe("PKCE", () => {
  test("S256 verifier matches only its own challenge", async () => {
    expect(await verifyPkce(verifier, await sha256(verifier))).toBe(true);
    expect(await verifyPkce("w".repeat(43), await sha256(verifier))).toBe(false);
  });
});

describe("desktop redeem endpoint (real better-auth)", () => {
  test("the right verifier gets a new session cookie for the user", async () => {
    const { auth, user, code, redeem } = await setup();
    const response = await redeem({ code, verifier });

    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("better-auth.session_token="));

    expect(response.status).toBe(200);
    expect(cookie).toBeDefined();

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie?.split(";")[0] ?? "" }),
    });

    expect(session?.user.id).toBe(user.id);
  });

  test("a wrong verifier is refused and burns the code", async () => {
    const { code, redeem } = await setup();

    expect((await redeem({ code, verifier: "w".repeat(43) })).status).toBe(400);
    expect((await redeem({ code, verifier })).status).toBe(400);
  });

  test("codes are single use", async () => {
    const { code, redeem } = await setup();

    expect((await redeem({ code, verifier })).status).toBe(200);
    expect((await redeem({ code, verifier })).status).toBe(400);
  });
});
