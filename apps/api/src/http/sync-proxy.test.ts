import { describe, expect, test } from "bun:test";
import {
  companiesSync,
  electricRequestHeaders,
  electricUrlFor,
  privateCacheControl,
  proxyResponse,
  proxyResponseHeaders,
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
