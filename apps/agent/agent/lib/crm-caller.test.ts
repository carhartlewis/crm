import { describe, expect, test } from "bun:test";
import { crmCaller } from "./crm-caller.ts";

describe("crmCaller", () => {
  test("a chat from the CRM carries its workspace", () => {
    expect(
      crmCaller({
        authenticator: "crm-proxy",
        principalType: "user",
        principalId: "user_1",
        attributes: { name: "Ana", email: "ana@example.com", workspaceId: "ws_1" },
      }),
    ).toEqual({ userId: "user_1", workspaceId: "ws_1" });
  });

  test("other users have no workspace; services and anonymous callers are not CRM users", () => {
    expect(
      crmCaller({
        authenticator: "local-dev",
        principalType: "user",
        principalId: "user_1",
        attributes: {},
      }),
    ).toEqual({ userId: "user_1", workspaceId: null });
    expect(
      crmCaller({
        authenticator: "crm-proxy",
        principalType: "service",
        principalId: "crm-api",
        attributes: {},
      }),
    ).toBeNull();
    expect(crmCaller(null)).toBeNull();
  });
});
