import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Cause, Effect, Exit, Option, References } from "effect";
import type { Actor } from "./record-writes.ts";
import { createMemorySavedViewStore } from "./saved-view-store.ts";
import { makeSavedViews } from "./SavedViews.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const carol: Actor = { userId: "user_carol", activeWorkspaceId: "ws_a" };
const bob: Actor = { userId: "user_bob", activeWorkspaceId: "ws_b" };

function setup() {
  const memory = createMemorySavedViewStore([
    "ws_a:user_alice",
    "ws_a:user_carol",
    "ws_b:user_bob",
  ]);

  return { ...memory, views: makeSavedViews(memory.store), rows: memory.views };
}

const quiet = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.provideService(effect, References.MinimumLogLevel, "None");

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(quiet(effect));

async function outcome<A, E extends object>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(quiet(effect));

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    onSome: (error) => error.constructor.name,
  });
}

async function view(env: ReturnType<typeof setup>, shared: boolean, actor = alice) {
  const id = createId("svw");

  await run(
    env.views.create(actor, {
      id,
      entity: "deal",
      name: " Open  deals ",
      query: "?stage=demo_booked&page=2",
      shared,
    }),
  );

  return id;
}

describe("saved views", () => {
  test("the caller owns a new view; its name and query are normalised", async () => {
    const env = setup();
    const id = await view(env, false);

    expect(env.rows().get(id)).toEqual({
      id,
      workspaceId: "ws_a",
      ownerId: "user_alice",
      entity: "deal",
      name: "Open deals",
      shared: false,
      query: "stage=demo_booked",
    });
  });

  test("refuses bad input", async () => {
    const env = setup();
    const base = { id: createId("svw"), entity: "deal", name: "View", query: "" };

    expect(await outcome(env.views.create(alice, { ...base, id: "nope" }))).toBe("Invalid");
    expect(await outcome(env.views.create(alice, { ...base, entity: "activity" }))).toBe("Invalid");
    expect(await outcome(env.views.create(alice, { ...base, name: " " }))).toBe("Invalid");
    expect(await outcome(env.views.create(bob, { ...base, id: createId("svw") }))).toBe("Success");
    expect(await outcome(env.views.create({ ...bob, activeWorkspaceId: "ws_a" }, base))).toBe(
      "NoActiveWorkspace",
    );
  });

  test("only the owner changes or deletes a personal view", async () => {
    const env = setup();
    const id = await view(env, false);

    expect(await outcome(env.views.update(carol, id, { name: "Mine now" }))).toBe("NotFound");
    expect(await outcome(env.views.remove(carol, id))).toBe("NotFound");
    expect(await outcome(env.views.update(alice, id, { name: "Renamed" }))).toBe("Success");
    expect(env.rows().get(id)?.name).toBe("Renamed");
    expect(await outcome(env.views.remove(alice, id))).toBe("Success");
    expect(env.rows().has(id)).toBe(false);
  });

  test("any member changes a shared view; only its owner changes who sees it", async () => {
    const env = setup();
    const id = await view(env, true);

    expect(await outcome(env.views.update(carol, id, { query: "owner=none" }))).toBe("Success");
    expect(env.rows().get(id)?.query).toBe("owner=none");
    expect(await outcome(env.views.update(carol, id, { shared: false }))).toBe("Invalid");
    expect(await outcome(env.views.update(alice, id, { shared: false }))).toBe("Success");
    expect(await outcome(env.views.remove(carol, id))).toBe("NotFound");
  });

  test("another workspace's view doesn't exist", async () => {
    const env = setup();
    const id = await view(env, true);

    expect(await outcome(env.views.update(bob, id, { name: "x" }))).toBe("NotFound");
    expect(await outcome(env.views.remove(bob, id))).toBe("NotFound");
  });
});
