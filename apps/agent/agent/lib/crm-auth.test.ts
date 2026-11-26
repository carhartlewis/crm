import { describe, expect, test } from "bun:test";
import { crmSession } from "./crm-auth.ts";

const alice = {
  id: "user_1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const api = (status: number, body: Json, seen: string[] = []) =>
  crmSession("http://api.test", async (url, init) => {
    seen.push(`${url} ${init.headers["cookie"]}`);

    return Response.json(body, { status });
  });

const request = (cookie?: string) =>
  new Request("http://agent.test/eve/v1/session", { headers: cookie ? { cookie } : {} });

describe("crmSession", () => {
  test("maps a CRM session to the eve caller and forwards only the cookie", async () => {
    const seen: string[] = [];
    const auth = await api(200, alice, seen)(request("better-auth.session_token=abc"));

    expect(auth).toEqual({
      authenticator: "crm-session",
      principalType: "user",
      principalId: "user_1",
      subject: "alice@example.com",
      attributes: { name: "Alice", email: "alice@example.com" },
    });
    expect(seen).toEqual(["http://api.test/api/account/me better-auth.session_token=abc"]);
  });

  test("rejects callers without a cookie without calling the API", async () => {
    const seen: string[] = [];

    expect(await api(200, alice, seen)(request())).toBeNull();
    expect(seen).toEqual([]);
  });

  test("rejects when the API says signed out", async () => {
    expect(await api(401, { _tag: "Unauthorized" })(request("x=1"))).toBeNull();
  });

  test("rejects a malformed user payload", async () => {
    expect(await api(200, { id: 1 })(request("x=1"))).toBeNull();
  });
});
