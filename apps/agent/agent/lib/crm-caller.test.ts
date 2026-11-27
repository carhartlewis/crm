import { describe, expect, test } from "bun:test";
import { crmCaller } from "./crm-caller.ts";

/** The record a chat from the CRM names, as the agent reads it. */
const recordFrom = (recordKind: string, recordId: string) =>
  crmCaller({
    authenticator: "crm-proxy",
    principalType: "user",
    principalId: "user_1",
    attributes: { workspaceId: "ws_1", recordKind, recordId },
  })?.record;

describe("crmCaller", () => {
  test("a chat from the CRM carries its workspace", () => {
    expect(
      crmCaller({
        authenticator: "crm-proxy",
        principalType: "user",
        principalId: "user_1",
        attributes: {
          name: "Ana",
          email: "ana@example.com",
          workspaceId: "ws_1",
          permissionMode: "bypass",
        },
      }),
    ).toEqual({
      userId: "user_1",
      workspaceId: "ws_1",
      permissionMode: "bypass",
      record: null,
    });
  });

  test("other users have no workspace; services and anonymous callers are not CRM users", () => {
    expect(
      crmCaller({
        authenticator: "local-dev",
        principalType: "user",
        principalId: "user_1",
        attributes: {},
      }),
    ).toEqual({ userId: "user_1", workspaceId: null, permissionMode: "manual", record: null });
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

  test("a chat from a record sheet names its record; a malformed one is dropped", () => {
    expect(recordFrom("company", "com_0123456789abcdefghijklmn")).toEqual({
      kind: "company",
      id: "com_0123456789abcdefghijklmn",
    });
    expect(recordFrom("company", "ctc_0123456789abcdefghijklmn")).toBeNull();
    expect(recordFrom("invoice", "com_0123456789abcdefghijklmn")).toBeNull();
  });
});
