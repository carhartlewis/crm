import { SessionUser } from "@crm/core/api";
import { createMemoryKv } from "@crm/core/kv";
import { integrations } from "@crm/integrations";
import { fakeUpstream } from "@crm/integrations/testing";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, describe, expect, test } from "bun:test";
import { Effect, Layer, Option, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Auth, AuthError } from "../services/Auth.ts";
import { Companies, makeCompanies } from "../services/Companies.ts";
import { createMemoryCompanyStore } from "../services/company-store-memory.ts";
import { Electric, makeElectric } from "../services/Electric.ts";
import {
  type ConnectionRecord,
  type ConnectionStore,
  Connections,
  makeConnections,
} from "../services/Connections.ts";
import { loopbackUrl } from "./desktop.ts";
import { Routes } from "./routes.ts";

const alice = new SessionUser({
  id: "user_1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
});

// Fake better-auth: "session=valid" is Alice, acting in the workspace after "workspace=".
const FakeAuth = Layer.succeed(
  Auth,
  Auth.of({
    handler: async (request) =>
      Response.json({ handledBy: "better-auth", path: new URL(request.url).pathname }),
    session: (headers) => {
      const cookie = headers.get("cookie") ?? "";

      if (cookie.includes("broken")) return Effect.fail(new AuthError({ cause: "redis down" }));

      if (!cookie.includes("session=valid")) return Effect.succeed(Option.none());

      return Effect.succeed(
        Option.some({
          // "as=bob" stands for a second signed-in user.
          user: cookie.includes("as=bob") ? new SessionUser({ ...alice, id: "user_2" }) : alice,
          activeWorkspaceId: cookie.includes("workspace=")
            ? (cookie.split("workspace=")[1] ?? null)
            : null,
        }),
      );
    },
    // A token "user_1:ws_1" stands for a verified MCP token with those claims.
    protectMcp: (handler) => async (request) => {
      const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      const [userId, workspaceId] = token.split(":");

      if (!userId || !workspaceId) {
        return new Response(null, {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer resource_metadata="http://api.test/.well-known/oauth-protected-resource/api/mcp"',
          },
        });
      }

      return handler(request, { userId, workspaceId });
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

// Alice is a member of ws_1 only. Connected apps are the in-process fake from @crm/integrations.
const upstream = fakeUpstream(integrations[0].mcpUrl);
const rows: ConnectionRecord[] = [];

const memoryStore: ConnectionStore = {
  isMember: async ({ workspaceId, userId }) => workspaceId === "ws_1" && userId === "user_1",
  list: async ({ workspaceId, userId }) =>
    rows.filter((row) => row.workspaceId === workspaceId && row.userId === userId),
  save: async (owner, row, now) => {
    const index = rows.findIndex(
      (existing) =>
        existing.workspaceId === owner.workspaceId &&
        existing.userId === owner.userId &&
        existing.integration === row.integration,
    );

    const createdAt = rows[index]?.createdAt ?? now;
    const record = { id: `c${rows.length}`, ...owner, ...row, createdAt, updatedAt: now };

    if (index === -1) rows.push(record);
    else rows[index] = record;
  },
  setAccess: async (owner, integration, access, now) => {
    const row = rows.find(
      (existing) =>
        existing.workspaceId === owner.workspaceId &&
        existing.userId === owner.userId &&
        existing.integration === integration,
    );

    if (!row) return null;

    const next = { ...row, access, updatedAt: now };

    rows[rows.indexOf(row)] = next;

    return next;
  },
  setCredentials: async (id, credentials) => {
    const row = rows.find((existing) => existing.id === id);

    if (row) rows[rows.indexOf(row)] = { ...row, credentials };
  },
  remove: async (owner, integration) => {
    const index = rows.findIndex(
      (existing) =>
        existing.workspaceId === owner.workspaceId &&
        existing.userId === owner.userId &&
        existing.integration === integration,
    );

    if (index === -1) return false;

    rows.splice(index, 1);

    return true;
  },
};

let states = 0;

const FakeConnections = Layer.succeed(
  Connections,
  makeConnections({
    store: memoryStore,
    kv: createMemoryKv(),
    cipher: { seal: async (data) => `sealed:${data}`, open: async (data) => data.slice(7) },
    oauth: {
      clientName: "CRM",
      redirectUrl: "http://api.test/api/connections/callback",
      fetch: upstream.fetch,
    },
    page: new URL("http://web.test/connections"),
    now: () => new Date("2026-11-26T12:00:00Z"),
    state: () => `state_${++states}`,
  }),
);

// Companies and Electric are not under test here; they only complete the route layer.
const FakeCompanies = Layer.succeed(Companies, makeCompanies(createMemoryCompanyStore([]).store));

const FakeElectric = Layer.succeed(
  Electric,
  makeElectric({
    url: new URL("http://electric.test"),
    secret: "electric-secret",
    fetch: async () => new Response(null, { status: 503 }),
  }),
);

const app = HttpRouter.toWebHandler(
  Routes.pipe(
    Layer.provide([
      FakeAuth,
      FakeConnections,
      FakeCompanies,
      FakeElectric,
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

interface AccessBody {
  readonly access: "read" | "write";
}

const decodeAuthorize = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }));
const decodeAccess = Schema.decodeUnknownSync(Schema.Struct({ access: Schema.String }));

const decodeClientMetadata = Schema.decodeUnknownSync(
  Schema.Struct({ redirect_uris: Schema.Array(Schema.String) }),
);

function send(method: string, path: string, cookie: string, body?: AccessBody) {
  const headers = new Headers({ cookie });
  const init: RequestInit = { method, headers };

  if (body) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }

  return app.handler(new Request(`http://api.test${path}`, init));
}

const member = "session=valid; workspace=ws_1";

async function connectNotes(access: "read" | "write") {
  const started = await send("POST", "/api/connections/granola/authorize", member, { access });
  const { url } = decodeAuthorize(await started.json());
  const state = new URL(url).searchParams.get("state") ?? "";

  return get(`/api/connections/callback?state=${state}&code=good`, member);
}

async function startedState() {
  const started = await send("POST", "/api/connections/granola/authorize", member, {
    access: "read",
  });

  return new URL(decodeAuthorize(await started.json()).url).searchParams.get("state");
}

async function agent(token?: string) {
  const client = new Client({ name: "agent", version: "1.0.0" });

  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://api.test/api/mcp"), {
      fetch: (input, init) => {
        const request = new Request(input.toString(), init);

        if (token) request.headers.set("authorization", `Bearer ${token}`);

        return app.handler(request);
      },
    }),
  );

  return client;
}

describe("connections", () => {
  test("need a workspace the user belongs to", async () => {
    expect((await get("/api/connections", "session=valid")).status).toBe(403);
    expect((await get("/api/connections", "session=valid; workspace=ws_2")).status).toBe(403);
    expect((await get("/api/connections")).status).toBe(401);
  });

  test("authorize returns the app's authorization URL; unknown apps are 404", async () => {
    const response = await send("POST", "/api/connections/granola/authorize", member, {
      access: "read",
    });

    const { url } = decodeAuthorize(await response.json());

    expect(new URL(url).origin).toBe("https://auth.notes.example");
    expect(
      (await send("POST", "/api/connections/nope/authorize", member, { access: "read" })).status,
    ).toBe(404);
  });

  test("the callback saves the connection and returns to the Connections page", async () => {
    const response = await connectNotes("read");

    expect(response.headers.get("location")).toBe("http://web.test/connections?connected=granola");
    expect(await (await get("/api/connections", member)).json()).toEqual([
      {
        integration: "granola",
        access: "read",
        createdAt: "2026-11-26T12:00:00.000Z",
        updatedAt: "2026-11-26T12:00:00.000Z",
      },
    ]);
  });

  test("a callback is single-use", async () => {
    const state = await startedState();
    const finish = () => get(`/api/connections/callback?state=${state}&code=good`, member);

    expect((await finish()).headers.get("location")).toContain("connected=granola");
    expect((await finish()).headers.get("location")).toContain("error=expired");
  });

  test("a different signed-in user can't finish someone else's sign-in", async () => {
    const state = await startedState();

    const response = await get(
      `/api/connections/callback?state=${state}&code=good`,
      "session=valid; as=bob",
    );

    expect(response.headers.get("location")).toContain("error=wrong_user");
  });

  test("a signed-out browser (desktop) finishes by state and is told to go back", async () => {
    const state = await startedState();
    const response = await get(`/api/connections/callback?state=${state}&code=good`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The app is connected");
  });

  test("access can change; removing disconnects", async () => {
    await connectNotes("read");

    const updated = await send("PATCH", "/api/connections/granola", member, { access: "write" });

    expect(decodeAccess(await updated.json()).access).toBe("write");
    expect((await send("DELETE", "/api/connections/granola", member)).status).toBe(204);
    expect((await send("DELETE", "/api/connections/granola", member)).status).toBe(404);
  });

  test("serves the Client ID Metadata Document", async () => {
    const document = decodeClientMetadata(
      await (await get("/api/connections/client-metadata.json")).json(),
    );

    expect(document.redirect_uris).toEqual(["http://api.test/api/connections/callback"]);
  });
});

describe("MCP gateway", () => {
  test("without a token, answers 401 with the discovery challenge", async () => {
    const response = await app.handler(
      new Request("http://api.test/api/mcp", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  test("gives the agent the user's connected tools in the token's workspace", async () => {
    await connectNotes("read");

    const tools = (await (await agent("user_1:ws_1")).listTools()).tools.map(({ name }) => name);
    const elsewhere = (await (await agent("user_1:ws_2")).listTools()).tools;

    expect(tools).toEqual(["granola__search_notes"]);
    expect(elsewhere).toEqual([]);
  });
});
