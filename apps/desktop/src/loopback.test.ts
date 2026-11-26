import { describe, expect, test } from "bun:test";
import { startLoopback } from "./loopback.ts";

const hit = (port: number, query: string) => fetch(`http://127.0.0.1:${port}/callback?${query}`);

describe("loopback sign-in", () => {
  test("resolves with the code when the state matches", async () => {
    const loop = await startLoopback();
    const response = await hit(loop.port, `state=${loop.state}&code=code_1`);

    expect(response.status).toBe(200);
    expect(await loop.code).toBe("code_1");
  });

  test("ignores a forged state and keeps waiting for the real callback", async () => {
    const loop = await startLoopback();

    expect((await hit(loop.port, "state=forged&code=evil")).status).toBe(400);
    await hit(loop.port, `state=${loop.state}&code=code_2`);
    expect(await loop.code).toBe("code_2");
  });

  test("rejects when the API reports a failed sign-in", async () => {
    const loop = await startLoopback();
    const rejection = expect(loop.code).rejects.toThrow("did not complete");

    expect((await hit(loop.port, `state=${loop.state}&error=not_signed_in`)).status).toBe(401);
    await rejection;
  });

  test("times out", async () => {
    const loop = await startLoopback(20);

    await expect(loop.code).rejects.toThrow("timed out");
  });

  test("close() cancels a pending attempt and frees the port", async () => {
    const loop = await startLoopback();
    const cancelled = expect(loop.code).rejects.toThrow("cancelled");

    loop.close();
    await cancelled;
    await expect(fetch(`http://127.0.0.1:${loop.port}/callback`)).rejects.toThrow();
  });
});
