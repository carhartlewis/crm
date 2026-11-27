import { describe, expect, test } from "bun:test";
import { branchMessage, branchOf } from "./chat-api.ts";

describe("a branch's first message", () => {
  test("names the chat it continues, so it shows as one line", () => {
    const text = branchMessage("Customer News", "Me: Find Capgo\n\nAssistant: Found it");

    expect(branchOf(text)).toBe("Customer News");
    expect(text).toContain("Me: Find Capgo");
    expect(branchOf("Continue with the next step")).toBeNull();
  });
});
