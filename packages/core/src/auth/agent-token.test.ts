import { describe, expect, test } from "bun:test";
import { AGENT_TOKEN_TTL_MS, mintAgentToken, verifyAgentToken } from "./agent-token.ts";

const secret = "s".repeat(40);
const claims = { userId: "user_1", workspaceId: "ws_1" };

describe("agent tokens", () => {
  test("a minted token verifies with the same secret until it expires", async () => {
    const token = await mintAgentToken(secret, claims, 1_000);

    expect(await verifyAgentToken(secret, token, 2_000)).toEqual(claims);
    expect(await verifyAgentToken(secret, token, 1_001 + AGENT_TOKEN_TTL_MS)).toBeNull();
  });

  test("refuses another secret, an edited payload and other tokens", async () => {
    const token = await mintAgentToken(secret, claims, 1_000);
    const [prefix, payload, signature] = token.split(".");
    const forged = `${prefix}.${payload?.slice(0, -2)}AA.${signature}`;

    expect(await verifyAgentToken("t".repeat(40), token, 2_000)).toBeNull();
    expect(await verifyAgentToken(secret, forged, 2_000)).toBeNull();
    expect(await verifyAgentToken(secret, "eyJhbGciOi.jwt.token", 2_000)).toBeNull();
    expect(await verifyAgentToken(secret, "crm1.garbage", 2_000)).toBeNull();
  });
});
