import { HANDOFF_COOKIE, codeKey, sha256 } from "@crm/core/auth/desktop-handoff";
import { createMemoryKv } from "@crm/core/kv";
import { describe, expect, test } from "bun:test";
import { DesktopCallback, DesktopStart } from "../http/desktop.ts";
import { makeDesktopHandoff, type HandoffSession } from "./desktop-handoff.ts";

const START = 1_000_000;
const challenge = await sha256("v".repeat(43));
const start = new DesktopStart({ port: 51234, state: "state-abcdefghijklmnop", challenge });
const callback = new DesktopCallback({ port: 51234, state: start.state });

function setup(
  session: HandoffSession | null = { userId: "user_1", createdAt: new Date(START + 5_000) },
) {
  let time = START;
  const kv = createMemoryKv(() => time);
  const signedOut: string[] = [];

  const handoff = makeDesktopHandoff({
    kv,
    apiOrigin: new URL("http://localhost:3001"),
    now: () => time,
    startGoogle: async (callbackURL) => ({
      url: `https://accounts.google.test/?cb=${encodeURIComponent(callbackURL)}`,
      cookies: ["better-auth.state=s; HttpOnly"],
    }),
    session: async () => session,
    signOut: async () => {
      signedOut.push("browser");

      return ["better-auth.session_token=; Max-Age=0"];
    },
  });

  return { kv, handoff, signedOut, advance: (ms: number) => (time += ms) };
}

/** Runs step 1 and returns the browser cookie header it set (nonce). */
async function begin(handoff: ReturnType<typeof setup>["handoff"]) {
  const response = await handoff.start(start, "203.0.113.9");

  const nonce = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${HANDOFF_COOKIE}=`));

  return { response, cookie: new Headers({ cookie: nonce?.split(";")[0] ?? "" }) };
}

const location = (response: Response) => new URL(response.headers.get("location") ?? "");

describe("desktop sign-in handoff", () => {
  test("happy path: fresh sign-in in the same browser yields a single-use code bound to the PKCE challenge", async () => {
    const { kv, handoff, signedOut } = setup();
    const { response, cookie } = await begin(handoff);

    expect(location(response).hostname).toBe("accounts.google.test");
    expect(response.headers.getSetCookie()).toContainEqual(
      expect.stringContaining("HttpOnly; SameSite=Lax"),
    );

    const done = await handoff.finish(cookie, callback, null);
    const loopback = location(done);
    const code = loopback.searchParams.get("code") ?? "";

    expect(loopback.origin).toBe("http://127.0.0.1:51234");
    expect(loopback.searchParams.get("state")).toBe(start.state);
    expect(JSON.parse((await kv.get(codeKey(await sha256(code)))) ?? "{}")).toEqual({
      userId: "user_1",
      challenge,
    });
    expect(signedOut).toEqual(["browser"]);
  });

  test("a callback nobody started is rejected without redirecting anywhere (no silent token minting)", async () => {
    const { handoff } = setup();

    const response = await handoff.finish(
      new Headers({ cookie: `${HANDOFF_COOKIE}=forged` }),
      callback,
      null,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  test("a different browser (missing or wrong nonce) is rejected", async () => {
    for (const cookie of ["", `${HANDOFF_COOKIE}=not-the-nonce`]) {
      const { handoff } = setup();

      // oxlint-disable-next-line no-await-in-loop -- each case runs its own fresh flow in order.
      await begin(handoff);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      expect((await handoff.finish(new Headers({ cookie }), callback, null)).status).toBe(400);
    }
  });

  test("a redirect to a different port than the one that started is rejected", async () => {
    const { handoff } = setup();
    const { cookie } = await begin(handoff);
    const other = new DesktopCallback({ port: 40000, state: start.state });

    expect((await handoff.finish(cookie, other, null)).status).toBe(400);
  });

  test("an older browser session is never handed over", async () => {
    const { handoff, signedOut } = setup({ userId: "user_1", createdAt: new Date(START - 60_000) });
    const { cookie } = await begin(handoff);
    const done = location(await handoff.finish(cookie, callback, null));

    expect(done.searchParams.get("error")).toBe("not_signed_in");
    expect(done.searchParams.get("code")).toBeNull();
    expect(signedOut).toEqual([]);
  });

  test("Google errors reach the app immediately", async () => {
    const { handoff } = setup();
    const { cookie } = await begin(handoff);

    expect(
      location(await handoff.finish(cookie, callback, "access_denied")).searchParams.get("error"),
    ).toBe("google_failed");
  });

  test("callbacks are single use; a consumed state can start a fresh attempt", async () => {
    const { handoff } = setup();
    const { cookie } = await begin(handoff);

    await handoff.finish(cookie, callback, null);
    expect((await handoff.finish(cookie, callback, null)).status).toBe(400);
    expect((await handoff.start(start, "203.0.113.9")).status).toBe(302);
  });

  test("attempts expire after ten minutes", async () => {
    const { handoff, advance } = setup();
    const { cookie } = await begin(handoff);

    advance(10 * 60_000 + 1);
    expect((await handoff.finish(cookie, callback, null)).status).toBe(400);
  });

  test("starting is rate limited per client", async () => {
    const { handoff } = setup();
    const statuses = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const fresh = new DesktopStart({
        port: 51234,
        state: `state-${attempt}-abcdefghijk`,
        challenge,
      });

      // oxlint-disable-next-line no-await-in-loop -- the limiter counts sequential attempts.
      statuses.push((await handoff.start(fresh, "203.0.113.9")).status);
    }

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, 10).every((status) => status === 302)).toBe(true);
  });
});
