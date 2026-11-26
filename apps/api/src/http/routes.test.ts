import { SessionUser } from "@crm/core/api";
import { afterAll, describe, expect, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Auth, AuthError } from "../services/Auth.ts";
import { loopbackUrl } from "./desktop.ts";
import { Routes } from "./routes.ts";

const alice = new SessionUser({
  id: "user_1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
});

// Fake better-auth: a valid session cookie resolves to Alice, "broken" simulates a store outage,
// and `/api/auth/*` echoes the path so the mount can be asserted.
const FakeAuth = Layer.succeed(
  Auth,
  Auth.of({
    handler: async (request) =>
      Response.json({ handledBy: "better-auth", path: new URL(request.url).pathname }),
    session: (headers) => {
      const cookie = headers.get("cookie") ?? "";

      if (cookie.includes("broken")) return Effect.fail(new AuthError({ cause: "redis down" }));

      return Effect.succeed(cookie.includes("session=valid") ? Option.some(alice) : Option.none());
    },
    desktopStart: (start, ip) =>
      Effect.succeed(
        new Response(null, {
          status: 302,
          headers: {
            location: `https://accounts.google.test/?port=${start.port}&ip=${ip}`,
            "set-cookie": "state=s1",
          },
        }),
      ),
    desktopFinish: (headers, callback, oauthError) =>
      Effect.succeed(
        Response.redirect(
          loopbackUrl(
            callback,
            oauthError
              ? { error: oauthError }
              : headers.get("cookie")
                ? { code: "code_1" }
                : { error: "not_signed_in" },
          ).href,
          302,
        ),
      ),
  }),
);

const app = HttpRouter.toWebHandler(
  Routes.pipe(Layer.provide([FakeAuth, HttpServer.layerServices])),
  {
    disableLogger: true,
  },
);

afterAll(() => app.dispose());

const get = (path: string, cookie?: string) =>
  app.handler(new Request(`http://api.test${path}`, { headers: cookie ? { cookie } : {} }));

describe("api routes", () => {
  test("health is public", async () => {
    expect((await get("/api/health")).status).toBe(204);
  });

  test("me returns the session user", async () => {
    const response = await get("/api/account/me", "session=valid");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
    });
  });

  test("me rejects a missing session with 401", async () => {
    const response = await get("/api/account/me");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ _tag: "Unauthorized", message: "Not signed in" });
  });

  test("a session store failure is a 401, not a 500", async () => {
    expect((await get("/api/account/me", "session=broken")).status).toBe(401);
  });

  test("better-auth owns /api/auth/*", async () => {
    const response = await get("/api/auth/get-session");

    expect(await response.json()).toEqual({
      handledBy: "better-auth",
      path: "/api/auth/get-session",
    });
  });

  test("desktop sign-in redirects to Google and forwards better-auth's state cookie", async () => {
    const response = await get(
      `/api/desktop/google?port=51234&state=abcdefghijklmnop&challenge=${"c".repeat(43)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toStartWith(
      "https://accounts.google.test/?port=51234",
    );
    expect(response.headers.get("set-cookie")).toBe("state=s1");
  });

  test("desktop callback redirects to the app's loopback with a single-use code", async () => {
    const response = await get(
      "/api/desktop/callback?port=51234&state=abcdefghijklmnop",
      "session=valid",
    );

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:51234/callback?state=abcdefghijklmnop&code=code_1",
    );
  });

  test("desktop routes reject a malformed handoff", async () => {
    const queries = [
      "port=80&state=abcdefghijklmnop",
      "port=51234&state=short",
      "state=abcdefghijklmnop",
    ];

    const responses = await Promise.all(
      queries.flatMap((query) => [
        get(`/api/desktop/google?${query}`),
        get(`/api/desktop/callback?${query}`),
      ]),
    );

    expect(responses.map((response) => response.status)).toEqual(responses.map(() => 400));
  });
});
