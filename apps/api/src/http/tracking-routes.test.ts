import { afterAll, describe, expect, test } from "bun:test";
import { createMemoryKv } from "@crm/core/kv";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { makeTracking, Tracking } from "../services/Tracking.ts";
import { createMemoryTrackingStore } from "../services/tracking-store-memory.ts";
import { TrackingRoutes } from "./tracking-routes.ts";

const KEY = "trk_0123456789ABCDEFGHIJKLMN";

const memory = createMemoryTrackingStore({ members: [] });

memory.keys.set("ws_a", KEY);

const app = HttpRouter.toWebHandler(
  TrackingRoutes.pipe(
    Layer.provide(Layer.succeed(Tracking, makeTracking(memory.store, createMemoryKv()))),
  ),
);

afterAll(() => app.dispose());

const post = (path: string, body: string) =>
  app.handler(
    new Request(`http://api.test${path}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    }),
  );

describe("tracking routes", () => {
  test("serve the snippet script to any site", async () => {
    const response = await app.handler(new Request("http://api.test/api/t/script.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toContain("/api/t/collect");
  });

  test("collect takes a text/plain JSON page view", async () => {
    const response = await post(
      "/api/t/collect",
      JSON.stringify({ key: KEY, visitor_id: "visitor-0001", path: "/pricing" }),
    );

    expect(response.status).toBe(204);
    expect(memory.visits().at(-1)).toMatchObject({ workspaceId: "ws_a", path: "/pricing" });
  });

  test("a body that isn't JSON, or too large, is a bad request", async () => {
    expect((await post("/api/t/collect", "not json")).status).toBe(400);
    expect((await post("/api/t/identify", "x".repeat(10_000))).status).toBe(400);
  });
});
