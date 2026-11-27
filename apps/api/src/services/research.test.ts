import { describe, expect, test } from "bun:test";
import type { ResearchQueue } from "./research-bullmq.ts";
import type { AgentCaller } from "./chat-agent.ts";
import { makeResearch, RESEARCH_PROMPTS, type ResearchDependencies } from "./Research.ts";
import { createMemoryEnds, createMemorySlots, type ResearchJob } from "./research-queue.ts";

const alice = { userId: "user_alice", activeWorkspaceId: "ws_a" };

/** BullMQ's part: jobs in order, one per id while it is waiting or running. */
function memoryQueue() {
  const jobs = new Map<string, ResearchJob>();

  const queue: ResearchQueue = {
    enqueue: async (job) => {
      if (jobs.has(job.id)) return false;

      jobs.set(job.id, job);

      return true;
    },
  };

  return { queue, jobs };
}

/** Lets started work reach its next wait. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<ResearchDependencies> = {}) {
  const sessions: { caller: AgentCaller; message: string; operationId: string }[] = [];
  const statuses: string[] = [];
  const logged: string[] = [];
  const { queue, jobs } = memoryQueue();
  const slots = createMemorySlots();
  const now = overrides.now ?? (() => 0);
  // The same clock as the research, so a lease ends when the research thinks it does.
  const ends = createMemoryEnds(now);

  const research = makeResearch({
    startSession: async (caller, message, operationId) => {
      sessions.push({ caller, message, operationId });
    },
    user: async (id) => (id === "user_alice" ? { name: "Alice", email: "alice@a.test" } : null),
    log: (message) => logged.push(message),
    now,
    queue,
    slots,
    ends,
    limits: { workspace: 3, global: 50, leaseMs: 60_000 },
    claim: async (job) => {
      statuses.push(`${job.recordId} running`);

      return job.recordId !== "com_archived";
    },
    unclaim: async (job) => {
      statuses.push(`${job.recordId} pending`);
    },
    ...overrides,
  });

  /** Runs every queued job in order, as BullMQ's worker would. */
  const work = async () => {
    await tick();

    const results = new Map<string, Promise<"busy" | "done">>();

    for (const [id, job] of jobs) {
      results.set(id, research.run(job));
      // oxlint-disable-next-line no-await-in-loop -- each job takes its slot before the next.
      await tick();
    }

    return results;
  };

  return { research, sessions, statuses, logged, jobs, slots, work };
}

describe("background research", () => {
  test("queues an Auto session about the record, as the member, once per record", async () => {
    const env = setup();

    env.research.start(alice, "contact", "ctc_1");
    env.research.start(alice, "contact", "ctc_1");
    await env.work();

    expect([...env.jobs.keys()]).toEqual(["research-ctc_1"]);
    expect(env.sessions).toEqual([
      {
        caller: {
          id: "user_alice",
          name: "Alice",
          email: "alice@a.test",
          workspaceId: "ws_a",
          permissionMode: "auto",
          origin: "research",
          researchJob: "research-ctc_1",
          record: { kind: "contact", id: "ctc_1" },
        },
        message: RESEARCH_PROMPTS.contact,
        operationId: "research:ctc_1",
      },
    ]);
    // The record shows "Researching" the moment its session starts.
    expect(env.statuses).toEqual(["ctc_1 running"]);
  });

  test("a deal's session is about the deal and asks for its brief", async () => {
    const env = setup();

    env.research.start(alice, "deal", "del_1");
    await env.work();

    expect(env.sessions[0]).toMatchObject({
      caller: { record: { kind: "deal", id: "del_1" }, permissionMode: "auto" },
      operationId: "research:del_1",
    });
    expect(env.sessions[0]?.message).toContain("research-deal");
    expect(env.sessions[0]?.message).toContain("write_deal_brief");
    expect(env.statuses).toEqual([]);
  });

  test("a bulk import runs a few at a time in a workspace; the rest wait their turn", async () => {
    const env = setup();

    for (let index = 0; index < 6; index += 1) {
      env.research.start(alice, "company", `com_${index}`);
    }

    const results = await env.work();

    expect(env.sessions.map((session) => session.operationId)).toEqual([
      "research:com_0",
      "research:com_1",
      "research:com_2",
    ]);
    expect(await results.get("research-com_3")).toBe("busy");

    // The agent's hook reports the end; the slot goes to the next job.
    await env.research.finished("ws_a", "research-com_1");
    expect(await results.get("research-com_1")).toBe("done");

    const waiting = env.jobs.get("research-com_3");

    expect(waiting).toBeDefined();

    if (!waiting) return;

    const next = env.research.run(waiting);

    await tick();
    expect(env.sessions.at(-1)?.operationId).toBe("research:com_3");
    await env.research.finished("ws_a", "research-com_3");
    expect(await next).toBe("done");
  });

  test("only the job's own workspace can end its session", async () => {
    const env = setup();

    env.research.start(alice, "company", "com_1");
    await env.work();
    await env.research.finished("ws_b", "research-com_1");

    expect(env.slots.running("ws_a")).toBe(1);
  });

  test("skips callers without a workspace, and members who left", async () => {
    const env = setup();

    env.research.start({ userId: "user_alice", activeWorkspaceId: null }, "company", "com_1");
    env.research.start({ userId: "user_ghost", activeWorkspaceId: "ws_a" }, "company", "com_2");
    await env.work();

    expect([...env.jobs.keys()]).toEqual(["research-com_2"]);
    expect(env.sessions).toEqual([]);
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("an archived record frees its slot without a session", async () => {
    const env = setup();

    env.research.start(alice, "company", "com_archived");
    await env.work();

    expect(env.sessions).toEqual([]);
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("a failed start is logged, never thrown, and the record waits again", async () => {
    const env = setup({
      startSession: async () => {
        throw new Error("agent down");
      },
    });

    env.research.start(alice, "company", "com_1");
    await env.work();

    expect(env.logged).toEqual(["research: company com_1"]);
    expect(env.statuses).toEqual(["com_1 running", "com_1 pending"]);
    expect(env.slots.running("ws_a")).toBe(0);
  });

  test("the sweep queues records whose research was lost, once a day each", async () => {
    const env = setup({
      now: () => Date.parse("2026-11-27T09:00:00Z"),
      pending: async () => [
        { kind: "contact", id: "ctc_1", workspaceId: "ws_a", userId: "user_alice" },
        { kind: "company", id: "com_1", workspaceId: "ws_a", userId: "user_alice" },
      ],
    });

    expect(await env.research.sweep()).toBe(2);
    await env.work();
    expect(env.sessions.map((session) => session.operationId)).toEqual([
      "research:ctc_1:2026-11-27",
      "research:com_1:2026-11-27",
    ]);

    // Still queued or running: the sweep leaves them alone.
    expect(await env.research.sweep()).toBe(0);
  });

  test("a fill waits its turn like any research, once per field per minute", async () => {
    const env = setup();
    const field = { id: "fld_1", entity: "company", label: "Industry" };
    const fillRest = env.research.fill;

    expect(await fillRest(alice, field)).toBe(true);
    expect(await fillRest(alice, field)).toBe(true);
    expect(await fillRest({ userId: "user_ghost", activeWorkspaceId: "ws_a" }, field)).toBe(false);
    await env.work();

    expect(env.sessions).toHaveLength(1);
    expect(env.sessions[0]).toMatchObject({
      caller: { researchJob: "fill-fld_1-0", origin: "research" },
      operationId: "fill-fld_1-0",
    });
    expect(env.sessions[0]?.caller.record).toBeUndefined();
    expect(env.sessions[0]?.message).toContain('"Industry"');
  });
});
