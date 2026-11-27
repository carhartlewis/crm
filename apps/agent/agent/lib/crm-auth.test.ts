import { describe, expect, test } from "bun:test";
import { crmProxy } from "./crm-auth.ts";

const secret = "s".repeat(40);

const request = (headers: Record<string, string>) =>
  new Request("http://agent.test/eve/v1/session/ses_1", { headers });

describe("crmProxy", () => {
  test("maps the caller the API names to the eve user", async () => {
    const auth = await crmProxy(secret)(
      request({
        authorization: `Bearer ${secret}`,
        "x-crm-user-id": "user_1",
        "x-crm-user-name": encodeURIComponent("Zoë Smith"),
        "x-crm-user-email": "zoe%40example.com",
        "x-crm-workspace-id": "ws_1",
      }),
    );

    expect(auth).toEqual({
      authenticator: "crm-proxy",
      principalType: "user",
      principalId: "user_1",
      subject: "zoe@example.com",
      attributes: { name: "Zoë Smith", email: "zoe@example.com", workspaceId: "ws_1" },
    });
  });

  test("the API without a user is a service caller", async () => {
    expect(await crmProxy(secret)(request({ authorization: `Bearer ${secret}` }))).toEqual({
      authenticator: "crm-proxy",
      principalType: "service",
      principalId: "crm-api",
      attributes: {},
    });
  });

  test("refuses a wrong secret, a missing one, and browser cookies", async () => {
    const headers = { "x-crm-user-id": "user_1" };

    expect(
      await crmProxy(secret)(request({ ...headers, authorization: "Bearer nope" })),
    ).toBeNull();
    expect(await crmProxy(secret)(request({ ...headers, cookie: "session=abc" }))).toBeNull();
  });

  test("refuses everything when the agent has no secret or a short one", async () => {
    const authorization = "Bearer short";

    expect(await crmProxy(undefined)(request({ authorization }))).toBeNull();
    expect(await crmProxy("short")(request({ authorization }))).toBeNull();
  });
});
