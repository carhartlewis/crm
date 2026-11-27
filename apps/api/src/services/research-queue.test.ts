import { describe, expect, test } from "bun:test";
import {
  createMemoryEnds,
  createMemorySlots,
  type QueueLimits,
  type ResearchJob,
  runResearchJob,
} from "./research-queue.ts";

const job = (id: string, workspaceId = "ws_a"): ResearchJob => ({
  id,
  workspaceId,
  userId: "user_alice",
  kind: "contact",
  recordId: id,
  field: null,
  operationId: id,
});

const limits: QueueLimits = { workspace: 2, global: 50, leaseMs: 60_000 };

/** Every session starts. */
const starts = async () => true;

function setup(begin: (job: ResearchJob) => Promise<boolean> = starts, lease = limits.leaseMs) {
  const slots = createMemorySlots();
  const ends = createMemoryEnds();
  const logged: string[] = [];
  const begun: string[] = [];

  const run = (next: ResearchJob) =>
    runResearchJob(next, {
      slots,
      ends,
      limits: { ...limits, leaseMs: lease },
      now: Date.now,
      begin: async (started) => {
        begun.push(started.id);

        return begin(started);
      },
      log: (message) => logged.push(message),
    });

  return { slots, ends, logged, begun, run };
}

/** Lets started jobs reach their wait. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("research jobs", () => {
  test("a job holds its workspace's slot until its session ends", async () => {
    const env = setup();
    const running = env.run(job("a1"));

    await tick();
    expect(env.begun).toEqual(["a1"]);
    expect(env.slots.running("ws_a")).toBe(1);

    await env.ends.end("a1");

    expect(await running).toBe("done");
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("a full workspace is busy; other workspaces are not", async () => {
    const env = setup();

    void env.run(job("a1"));
    void env.run(job("a2"));
    await tick();

    expect(await env.run(job("a3"))).toBe("busy");
    expect(env.begun).toEqual(["a1", "a2"]);

    const other = env.run(job("b1", "ws_b"));

    await tick();
    expect(env.begun).toEqual(["a1", "a2", "b1"]);

    await env.ends.end("b1");
    expect(await other).toBe("done");
  });

  test("a job run again after a restart keeps its own slot", async () => {
    const env = setup();

    void env.run(job("a1"));
    void env.run(job("a2"));
    await tick();

    const again = env.run(job("a1"));

    await tick();
    expect(env.begun).toEqual(["a1", "a2", "a1"]);

    await env.ends.end("a1");
    expect(await again).toBe("done");
  });

  test("a session that ends before its job waits still frees the slot", async () => {
    const env = setup(async (started) => {
      await env.ends.end(started.id);

      return true;
    });

    expect(await env.run(job("a1"))).toBe("done");
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("a job that can't start, or has nothing to start, frees its slot", async () => {
    const failing = setup(async () => {
      throw new Error("agent down");
    });

    expect(await failing.run(job("a1"))).toBe("done");
    expect(failing.logged).toEqual(["research: contact a1"]);
    expect(failing.slots.running("ws_a")).toBe(0);

    const gone = setup(async () => false);

    expect(await gone.run(job("a1"))).toBe("done");
    expect(gone.slots.running("ws_a")).toBe(0);
  });

  test("a session that never reports back frees its slot when the lease lapses", async () => {
    const env = setup(starts, 5);

    expect(await env.run(job("a1"))).toBe("done");
    expect(env.logged).toEqual(["research queue: a1 held its slot past the lease"]);
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("lapsed slots are freed for new jobs", async () => {
    const slots = createMemorySlots();

    expect(await slots.acquire(job("a1"), 0, 10, 1)).toBe(true);
    expect(await slots.acquire(job("a2"), 5, 15, 1)).toBe(false);
    expect(await slots.acquire(job("a2"), 10, 20, 1)).toBe(true);
    expect(await slots.holds("ws_a", "a1")).toBe(false);
  });
});
