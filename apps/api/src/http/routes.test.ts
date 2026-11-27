import { SessionUser } from "@crm/core/api";
import { createMemoryKv } from "@crm/core/kv";
import { afterAll, describe, expect, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Auth, AuthError, type SessionInfo } from "../services/Auth.ts";
import { Companies, makeCompanies } from "../services/Companies.ts";
import { Connections, makeConnections } from "../services/Connections.ts";
import { createMemoryCompanyStore } from "../services/company-store-memory.ts";
import { Electric, makeElectric } from "../services/Electric.ts";
import { createMemorySkillStore } from "../services/skill-store-memory.ts";
import { makeSkills, Skills } from "../services/Skills.ts";
import { loopbackUrl } from "./desktop.ts";
import { Routes } from "./routes.ts";

const alice = new SessionUser({
  id: "user_1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
});

// Sessions by cookie: Alice acts in ws_a (a member); "nows" has no active workspace; "intruder"
// claims ws_a without a membership.
const sessions = new Map<string, SessionInfo>([
  ["session=valid", { user: alice, activeWorkspaceId: "ws_a" }],
  ["session=nows", { user: alice, activeWorkspaceId: null }],
  [
    "session=intruder",
    {
      user: new SessionUser({ ...alice, id: "user_2", email: "mallory@example.com" }),
      activeWorkspaceId: "ws_a",
    },
  ],
]);

// Fake better-auth: a known session cookie resolves to its session, "broken" simulates a store
// outage, and `/api/auth/*` echoes the path so the mount can be asserted.
const FakeAuth = Layer.succeed(
  Auth,
  Auth.of({
    handler: async (request) =>
      Response.json({ handledBy: "better-auth", path: new URL(request.url).pathname }),
    session: (headers) => {
      const cookie = headers.get("cookie") ?? "";

      if (cookie.includes("broken")) return Effect.fail(new AuthError({ cause: "redis down" }));

      return Effect.succeed(Option.fromNullishOr(sessions.get(cookie)));
    },
    // The gateway is covered in connections.test.ts; here every MCP request is unauthenticated.
    protectMcp: () => async () => new Response(null, { status: 401 }),
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

const memory = createMemoryCompanyStore(["ws_a:user_1"]);
const FakeCompanies = Layer.succeed(Companies, makeCompanies(memory.store));

// Fake Electric: records each upstream URL and answers like Electric's initial snapshot.
const electricCalls: URL[] = [];

const FakeElectric = Layer.succeed(
  Electric,
  makeElectric({
    url: new URL("http://electric.test"),
    secret: "electric-secret",
    fetch: async (url) => {
      electricCalls.push(url);

      if (url.searchParams.get("offset") === "boom") throw new Error("connection refused");

      return new Response('[{"headers":{"control":"up-to-date"}}]', {
        status: url.searchParams.get("handle") === "gone" ? 409 : 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=604800, s-maxage=3600",
          "access-control-allow-origin": "*",
          "electric-handle": "h-1",
          "electric-offset": "0_0",
        },
      });
    },
  }),
);

// Connections are covered in connections.test.ts; here they only complete the route layer.
const FakeConnections = Layer.succeed(
  Connections,
  makeConnections({
    store: {
      isMember: async () => false,
      list: async () => [],
      save: async () => {},
      setAccess: async () => null,
      setCredentials: async () => {},
      remove: async () => false,
    },
    kv: createMemoryKv(),
    cipher: { seal: async (data) => data, open: async (data) => data },
    oauth: { clientName: "CRM", redirectUrl: "http://api.test/api/connections/callback" },
    page: new URL("http://web.test/connections"),
    now: () => new Date(),
    state: () => "state",
  }),
);

const app = HttpRouter.toWebHandler(
  Routes.pipe(
    Layer.provide([
      FakeAuth,
      FakeCompanies,
      FakeElectric,
      FakeConnections,
      Layer.succeed(
        Skills,
        makeSkills({ store: createMemorySkillStore([]).store, now: () => new Date() }),
      ),
      HttpServer.layerServices,
    ]),
  ),
  {
    disableLogger: true,
  },
);

afterAll(() => app.dispose());

const get = (path: string, cookie?: string) =>
  app.handler(new Request(`http://api.test${path}`, { headers: cookie ? { cookie } : {} }));

type Body = Record<string, string | null>;

const send = (method: string, path: string, cookie: string, body?: Body) =>
  app.handler(
    new Request(`http://api.test${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

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

describe("companies api", () => {
  test("create, update and delete return the write's txid", async () => {
    const id = crypto.randomUUID();

    const created = await send("POST", "/api/companies", "session=valid", {
      id,
      name: " Acme ",
      domain: "https://www.acme.com",
    });

    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ txid: expect.any(Number) });
    expect(memory.rows().get(id)).toMatchObject({
      name: "Acme",
      domain: "acme.com",
      workspaceId: "ws_a",
    });

    const updated = await send("PATCH", `/api/companies/${id}`, "session=valid", { domain: null });

    expect(updated.status).toBe(200);
    expect(memory.rows().get(id)?.domain).toBeNull();

    expect((await send("DELETE", `/api/companies/${id}`, "session=valid")).status).toBe(200);
    expect(memory.rows().has(id)).toBe(false);
  });

  test("typed errors map to 400, 401, 403 and 404", async () => {
    const id = crypto.randomUUID();
    const body = { id, name: "Acme", domain: null };

    const invalid = await send("POST", "/api/companies", "session=valid", { ...body, name: "" });

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ _tag: "Invalid" });
    expect((await send("POST", "/api/companies", "", body)).status).toBe(401);
    expect((await send("POST", "/api/companies", "session=nows", body)).status).toBe(403);
    expect((await send("POST", "/api/companies", "session=intruder", body)).status).toBe(403);

    const missing = await send("PATCH", `/api/companies/${id}`, "session=valid", { name: "B" });

    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ _tag: "NotFound" });
  });
});

describe("companies shape proxy", () => {
  const path = "/api/shapes/companies";

  test("requires a session", async () => {
    const response = await get(`${path}?workspace=ws_a&offset=-1`);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("requires ?workspace= to be the session's active workspace with a membership", async () => {
    const before = electricCalls.length;

    for (const [query, cookie] of [
      ["offset=-1", "session=valid"],
      ["workspace=ws_b&offset=-1", "session=valid"],
      ["workspace=ws_a&offset=-1", "session=nows"],
      ["workspace=ws_a&offset=-1", "session=intruder"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each case is independent and small.
      expect((await get(`${path}?${query}`, cookie)).status).toBe(403);
    }

    expect(electricCalls.length).toBe(before);
  });

  test("proxies a fixed, workspace-filtered shape and makes caching private", async () => {
    const response = await get(
      `${path}?workspace=ws_a&offset=-1&table=user&where=true&secret=x&params%5B1%5D=ws_b`,
      "session=valid",
    );

    const upstream = electricCalls.at(-1);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('[{"headers":{"control":"up-to-date"}}]');
    expect(Object.fromEntries(upstream?.searchParams ?? [])).toEqual({
      offset: "-1",
      table: "company",
      where: "workspace_id = $1",
      "params[1]": "ws_a",
      secret: "electric-secret",
    });
    expect(response.headers.get("electric-handle")).toBe("h-1");
    expect(response.headers.get("cache-control")).toBe("private, max-age=604800");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("passes Electric's error status through, and reports an unreachable Electric as 502", async () => {
    expect(
      (await get(`${path}?workspace=ws_a&offset=0_0&handle=gone`, "session=valid")).status,
    ).toBe(409);
    expect((await get(`${path}?workspace=ws_a&offset=boom`, "session=valid")).status).toBe(502);
  });
});
