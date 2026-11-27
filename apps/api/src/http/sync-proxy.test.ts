import { describe, expect, test } from "bun:test";
import {
  companiesSync,
  connectionsSync,
  customConnectorsSync,
  electricRequestHeaders,
  electricUrlFor,
  privateCacheControl,
  proxyResponse,
  proxyResponseHeaders,
  skillsSync,
  memoryFactsSync,
  usageCostsSync,
  usageSync,
} from "./sync-proxy.ts";

const electric = new URL("http://127.0.0.1:53000");

describe("electricUrlFor", () => {
  test("forwards protocol params and fixes table, where, params and secret on the server", () => {
    const client = new URLSearchParams({
      offset: "0_0",
      handle: "h-1",
      live: "true",
      cursor: "c-9",
      "cache-buster": "x",
      subset__limit: "10",
      // Everything below must never reach Electric from the client.
      table: "user",
      where: "true",
      "params[1]": "ws_other",
      columns: "id,email",
      replica: "full",
      secret: "guess",
      workspace: "ws_a",
      unknown: "1",
    });

    const url = electricUrlFor(electric, "s3cret", client, companiesSync("ws_a"));

    expect(url.origin + url.pathname).toBe("http://127.0.0.1:53000/v1/shape");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      offset: "0_0",
      handle: "h-1",
      live: "true",
      cursor: "c-9",
      "cache-buster": "x",
      subset__limit: "10",
      table: "company",
      where: "workspace_id = $1",
      "params[1]": "ws_a",
      secret: "s3cret",
    });
  });

  test("a repeated server key from the client cannot override the server value", () => {
    const client = new URLSearchParams([
      ["table", "user"],
      ["secret", "a"],
    ]);

    const url = electricUrlFor(electric, "s3cret", client, companiesSync("ws_a"));

    expect(url.searchParams.getAll("table")).toEqual(["company"]);
    expect(url.searchParams.getAll("secret")).toEqual(["s3cret"]);
  });

  test("the workspace id is a bound parameter, never part of the where clause", () => {
    const spec = companiesSync("ws_a' OR true --");

    expect(spec.where).toBe("workspace_id = $1");
    expect(spec.params).toEqual(["ws_a' OR true --"]);
  });
});

describe("electricRequestHeaders", () => {
  test("forwards only If-None-Match", () => {
    const headers = electricRequestHeaders(
      new Headers({ cookie: "session=1", "if-none-match": '"etag-1"', authorization: "x" }),
    );

    expect([...headers]).toEqual([["if-none-match", '"etag-1"']]);
  });
});

describe("privateCacheControl", () => {
  test("turns Electric's public caching into private browser caching", () => {
    expect(
      privateCacheControl("public, max-age=604800, s-maxage=3600, stale-while-revalidate=2629746"),
    ).toBe("private, max-age=604800, stale-while-revalidate=2629746");
    expect(privateCacheControl("public, max-age=5, stale-while-revalidate=5")).toBe(
      "private, max-age=5, stale-while-revalidate=5",
    );
    expect(privateCacheControl("no-store")).toBe("private, no-store");
    expect(privateCacheControl(null)).toBe("private, no-store");
  });
});

describe("proxyResponseHeaders", () => {
  test("keeps electric-* headers, type and etag; drops encoding, hop-by-hop and CORS", () => {
    const headers = proxyResponseHeaders(
      new Headers({
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "gzip",
        "content-length": "123",
        "transfer-encoding": "chunked",
        connection: "keep-alive",
        etag: '"h:-1:0_0"',
        vary: "accept-encoding",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
        "electric-handle": "h-1",
        "electric-offset": "0_0",
        "electric-schema": "{}",
        "electric-up-to-date": "",
        "x-request-id": "r",
      }),
    );

    expect(Object.fromEntries(headers)).toEqual({
      "content-type": "application/json; charset=utf-8",
      etag: '"h:-1:0_0"',
      "cache-control": "private, max-age=60",
      vary: "Cookie",
      "electric-handle": "h-1",
      "electric-offset": "0_0",
      "electric-schema": "{}",
      "electric-up-to-date": "",
    });
  });
});

describe("proxyResponse", () => {
  test("passes Electric's status and body through", async () => {
    const response = proxyResponse(
      new Response('{"message":"must refetch"}', {
        status: 409,
        headers: { "content-type": "application/json", "electric-handle": "h-2" },
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("electric-handle")).toBe("h-2");
    expect(await response.text()).toBe('{"message":"must refetch"}');
  });
});

/** The upstream query a spec produces for a client that sends nothing. */
const upstream = (spec: Parameters<typeof electricUrlFor>[3]) =>
  Object.fromEntries(electricUrlFor(electric, "s3cret", new URLSearchParams(), spec).searchParams);

describe("synced tables", () => {
  test("connections: only the caller's, and never their credentials", () => {
    const params = upstream(connectionsSync("ws_a", "user_1"));

    expect(params).toMatchObject({
      table: "connection",
      where: "workspace_id = $1 AND user_id = $2",
      "params[1]": "ws_a",
      "params[2]": "user_1",
    });
    expect(params["columns"]?.split(",")).not.toContain("credentials");
    expect(params["columns"]?.split(",")).toContain("id");
  });

  test("a client's columns cannot widen a fixed column list", () => {
    const client = new URLSearchParams({ columns: "id,credentials" });
    const url = electricUrlFor(electric, "s3cret", client, connectionsSync("ws_a", "user_1"));

    expect(url.searchParams.getAll("columns")).toEqual([
      "id,workspace_id,user_id,integration,access,created_at,updated_at",
    ]);
  });

  test("custom connectors and skills are per workspace; skill files stay on the server", () => {
    expect(upstream(customConnectorsSync("ws_a"))).toMatchObject({
      table: "custom_connector",
      where: "workspace_id = $1",
      "params[1]": "ws_a",
    });

    const skills = upstream(skillsSync("ws_a"));

    expect(skills).toMatchObject({
      table: "skill",
      where: "workspace_id = $1",
      "params[1]": "ws_a",
    });
    expect(skills["columns"]?.split(",")).not.toContain("files");
  });

  test("memory facts are per workspace, without the server's sync time", () => {
    const facts = upstream(memoryFactsSync("ws_a"));

    expect(facts).toMatchObject({
      table: "memory_fact",
      where: "workspace_id = $1",
      "params[1]": "ws_a",
    });
    expect(facts["columns"]?.split(",")).toEqual([
      "id",
      "workspace_id",
      "company_id",
      "text",
      "is_static",
      "created_at",
    ]);
  });
});

describe("usage shapes", () => {
  test("members see what lookups cost the workspace, never what they cost us", () => {
    const params = upstream(usageSync("ws_a"));

    expect(params).toMatchObject({ table: "usage_event", "params[1]": "ws_a" });
    expect(params["columns"]?.split(",")).toContain("price_micro");
    expect(params["columns"]?.split(",")).not.toContain("cost_micro");
    expect(params["columns"]?.split(",")).not.toContain("provider_call_id");
  });

  test("our cost syncs only to the workspace's owners and admins", () => {
    const params = upstream(usageCostsSync("ws_a", "user_1"));

    expect(params["where"]).toContain("role IN ('owner', 'admin')");
    expect(params).toMatchObject({ "params[1]": "ws_a", "params[2]": "user_1" });
    expect(params["columns"]).toBe("id,workspace_id,cost_micro");
  });
});
