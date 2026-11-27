import { createMemoryFactMirror } from "../services/memory-mirror-memory.ts";
import { createImageCache, createChatFiles, createMemoryStorage } from "@crm/core/storage";
import { SessionUser } from "@crm/core/api";
import { createMemoryKv } from "@crm/core/kv";
import { integrations } from "@crm/integrations";
import { fakeUpstream } from "@crm/integrations/testing";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, describe, expect, test } from "bun:test";
import { Effect, Layer, Option, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Auth, AuthError } from "../services/Auth.ts";
import { Chats, makeChats } from "../services/Chats.ts";
import { createMemoryChatStore } from "../services/chat-store-memory.ts";
import { CrmTools } from "../services/crm-tools.ts";
import { Intel, makeIntel } from "../services/Intel.ts";
import { createMemoryIntelStore } from "../services/intel-store-memory.ts";
import { Companies, makeCompanies } from "../services/Companies.ts";
import { ChatFiles, Images } from "../services/Images.ts";
import { makeMemory, Memory } from "../services/Memory.ts";
import { createMemoryDirectory } from "../services/memory-directory-memory.ts";
import { createMemoryCompanyStore } from "../services/record-store-memory.ts";
import { makeRecords, Records } from "../services/Records.ts";
import { createMemoryFieldStore } from "../services/field-store-memory.ts";
import { Fields, makeFields } from "../services/Fields.ts";
import { Research } from "../services/Research.ts";
import { makeUsage, Usage } from "../services/Usage.ts";
import { emptyUsage } from "../services/usage-store-memory.ts";
import { Electric, makeElectric } from "../services/Electric.ts";
import { createMemorySkillStore } from "../services/skill-store-memory.ts";
import { makeSkills, Skills } from "../services/Skills.ts";
import {
  type ConnectionRecord,
  type ConnectionStore,
  type CustomConnectorRecord,
  Connections,
  makeConnections,
} from "../services/Connections.ts";
import { loopbackUrl } from "./desktop.ts";
import { Routes } from "./routes.ts";
import { makeMoney, Money } from "../services/Money.ts";
import { createMemoryMoneyStore } from "../services/money-store-memory.ts";
import { createMemorySavedViewStore } from "../services/saved-view-store.ts";
import { makeSavedViews, SavedViews } from "../services/SavedViews.ts";
import { makeTracking, Tracking } from "../services/Tracking.ts";
import { createMemoryTrackingStore } from "../services/tracking-store-memory.ts";

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
const customs: (CustomConnectorRecord & { workspaceId: string })[] = [];
let lastTxid = 0;

/** Each write is one transaction: the result and a new txid, like the Prisma store. */
const written = <A>(result: A) => ({ result, txid: ++lastTxid });

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

    if (!row) return written(null);

    const next = { ...row, access, updatedAt: now };

    rows[rows.indexOf(row)] = next;

    return written(next);
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

    if (index === -1) return written(false);

    rows.splice(index, 1);

    return written(true);
  },
  customConnectors: async (workspaceId) =>
    customs.filter((connector) => connector.workspaceId === workspaceId),
  addCustom: async ({ workspaceId }, connector) => {
    if (customs.some((c) => c.workspaceId === workspaceId && c.key === connector.key)) {
      return written(false);
    }

    customs.push({ ...connector, workspaceId });

    return written(true);
  },
  removeCustom: async (workspaceId, key) => {
    const index = customs.findIndex((c) => c.workspaceId === workspaceId && c.key === key);

    if (index === -1) return written(false);

    customs.splice(index, 1);

    for (let at = rows.length - 1; at >= 0; at -= 1) {
      if (rows[at]?.workspaceId === workspaceId && rows[at]?.integration === key)
        rows.splice(at, 1);
    }

    return written(true);
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
    logo: async (website) => `https://storage.test/logos/${new URL(website).hostname}`,
    // Custom connectors are served by the same fake, at a second URL.
    checkServer: async (mcpUrl) => mcpUrl.startsWith("https://mcp.notes.example/"),
  }),
);

// Companies and Electric are not under test here; they only complete the route layer.
const FakeCompanies = Layer.succeed(Companies, makeCompanies(createMemoryCompanyStore([]).store));
const FakeRecords = Layer.succeed(Records, makeRecords(createMemoryCompanyStore([]).store));

const FakeChats = Layer.succeed(
  Chats,
  makeChats(createMemoryChatStore([]).store, null, createMemoryKv()),
);

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
      FakeRecords,
      Layer.succeed(Fields, makeFields(createMemoryFieldStore({ members: [] }).store)),
      Layer.succeed(Research, {
        start: () => {},
        fill: async () => true,
        sweep: async () => 0,
        finished: async () => {},
      }),
      Layer.succeed(Usage, makeUsage(emptyUsage)),
      FakeChats,
      Layer.succeed(Intel, makeIntel(createMemoryIntelStore([]).store)),
      Layer.succeed(CrmTools, { forCaller: () => [] }),
      FakeElectric,
      Layer.succeed(
        Skills,
        makeSkills({
          store: createMemorySkillStore([]).store,
          kv: createMemoryKv(),
          now: () => new Date(),
        }),
      ),
      Layer.succeed(Images, createImageCache({ storage: createMemoryStorage() })),
      Layer.succeed(ChatFiles, createChatFiles({ storage: createMemoryStorage() })),
      // Money and saved views are covered in money.test.ts and saved-views.test.ts.
      Layer.succeed(
        Money,
        makeMoney(createMemoryMoneyStore([]).store, { fetch: async () => Response.json({}) }),
      ),
      Layer.succeed(SavedViews, makeSavedViews(createMemorySavedViewStore([]).store)),
      Layer.succeed(
        Tracking,
        makeTracking(createMemoryTrackingStore({ members: [] }).store, createMemoryKv()),
      ),
      // Memory is covered in Memory.test.ts; here it is off.
      Layer.succeed(
        Memory,
        makeMemory({
          store: null,
          researcher: null,
          mirror: createMemoryFactMirror().mirror,
          kv: createMemoryKv(),
          directory: createMemoryDirectory({}),
          prefix: "test",
          now: () => new Date(),
          log: () => {},
        }),
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

type RequestBody =
  | { readonly access: "read" | "write" }
  | { readonly name: string; readonly url: string };

const decodeAuthorize = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }));
const decodeCatalog = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String })));

const decodeConnections = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ access: Schema.String })),
);

const decodeTxid = Schema.decodeUnknownSync(Schema.Struct({ txid: Schema.Number }));

const decodeClientMetadata = Schema.decodeUnknownSync(
  Schema.Struct({ redirect_uris: Schema.Array(Schema.String) }),
);

function send(method: string, path: string, cookie: string, body?: RequestBody) {
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

    // Writes answer with their txid; the browser sees the row change through sync.
    expect(decodeTxid(await updated.json()).txid).toBeGreaterThan(0);
    const [connection] = decodeConnections(await (await get("/api/connections", member)).json());

    expect(connection?.access).toBe("write");

    const removed = await send("DELETE", "/api/connections/granola", member);

    expect(removed.status).toBe(200);
    expect(decodeTxid(await removed.json()).txid).toBeGreaterThan(0);
    expect((await send("DELETE", "/api/connections/granola", member)).status).toBe(404);
  });

  test("serves each app's stored logo, and needs a workspace", async () => {
    const response = await get("/api/connections/logos", member);

    expect(await response.json()).toEqual(
      Object.fromEntries(
        integrations.map(({ id, domain }) => [id, `https://storage.test/logos/${domain}`]),
      ),
    );
    expect((await get("/api/connections/logos", "session=valid")).status).toBe(403);
  });

  test("a member adds a custom connector; everyone sees it; removing drops connections", async () => {
    const added = await send("POST", "/api/connections/custom", member, {
      name: "Notes",
      url: "https://mcp.notes.example/mcp",
    });

    expect(decodeTxid(await added.json()).txid).toBeGreaterThan(0);

    const catalog = decodeCatalog(await (await get("/api/connections/catalog", member)).json());

    expect(catalog.map(({ id }) => id)).toEqual([...integrations.map(({ id }) => id), "notes"]);

    const refused = await send("POST", "/api/connections/custom", member, {
      name: "Elsewhere",
      url: "https://not-mcp.example/mcp",
    });

    const internal = await send("POST", "/api/connections/custom", member, {
      name: "Inside",
      url: "https://localhost/mcp",
    });

    expect(refused.status).toBe(502);
    expect(internal.status).toBe(400);
    expect((await send("DELETE", "/api/connections/custom/notes", member)).status).toBe(200);
    expect((await send("DELETE", "/api/connections/custom/notes", member)).status).toBe(404);
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
