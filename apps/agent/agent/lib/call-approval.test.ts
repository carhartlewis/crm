import { describe, expect, test } from "bun:test";
import { decideCall, PLAN_REASON } from "./call-approval.ts";

function decide(
  toolName: string,
  hints: { readOnlyHint?: boolean; destructiveHint?: boolean },
  permissionMode = "",
) {
  return decideCall(
    "connections",
    {
      authenticator: "crm-proxy",
      principalType: "user",
      principalId: "u1",
      attributes: permissionMode
        ? { workspaceId: "ws_1", permissionMode }
        : { workspaceId: "ws_1" },
    },
    `connections__${toolName}`,
    hints,
  );
}

const create = { readOnlyHint: false, destructiveHint: false };
const forget = { readOnlyHint: false, destructiveHint: true };

describe("call approval", () => {
  test("Manual asks before changes; reads run", () => {
    expect(decide("crm__list_companies", { readOnlyHint: true })).toBe("not-applicable");
    expect(decide("crm__create_company", create)).toBe("user-approval");
  });

  test("Auto runs changes and asks before risky calls", () => {
    expect(decide("crm__create_company", create, "auto")).toBe("not-applicable");
    expect(decide("crm__forget", forget, "auto")).toBe("user-approval");
  });

  test("Bypass runs risky calls, marked", () => {
    expect(decide("superhuman__send_email", {}, "bypass")).toEqual({
      type: "approved",
      reason: "risky",
    });
  });

  test("Plan runs reads and refuses every change with a reason the model acts on", () => {
    expect(decide("crm__list_companies", { readOnlyHint: true }, "plan")).toBe("not-applicable");
    expect(decide("crm__create_company", create, "plan")).toEqual({
      type: "denied",
      reason: PLAN_REASON,
    });
    expect(decide("crm__forget", forget, "plan")).toMatchObject({ type: "denied" });
  });

  test("an unknown mode is Manual, and a caller who isn't a CRM user is refused", () => {
    expect(decide("crm__create_company", create, "yolo")).toBe("user-approval");
    expect(decideCall("connections", null, "connections__crm__list_companies", {})).toMatchObject({
      type: "denied",
    });
  });
});
