import { describe, expect, test } from "bun:test";
import type { AgentCaller } from "./chat-agent.ts";
import { makeResearch, RESEARCH_LIMIT, RESEARCH_PROMPTS, RESEARCH_WINDOW_MS } from "./Research.ts";

const alice = { userId: "user_alice", activeWorkspaceId: "ws_a" };

function setup() {
  const sessions: { caller: AgentCaller; message: string; operationId: string }[] = [];
  let clock = 0;

  const research = makeResearch({
    startSession: async (caller, message, operationId) => {
      sessions.push({ caller, message, operationId });
    },
    user: async (id) => (id === "user_alice" ? { name: "Alice", email: "alice@a.test" } : null),
    log: () => {},
    now: () => clock,
  });

  return { research, sessions, advance: (ms: number) => (clock += ms) };
}

/** Lets the started work run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("background research", () => {
  test("starts an Auto session about the record, as the member, once per record", async () => {
    const env = setup();

    env.research.start(alice, "contact", "ctc_1");
    await settle();

    expect(env.sessions).toEqual([
      {
        caller: {
          id: "user_alice",
          name: "Alice",
          email: "alice@a.test",
          workspaceId: "ws_a",
          permissionMode: "auto",
          record: { kind: "contact", id: "ctc_1" },
          origin: "research",
        },
        message: RESEARCH_PROMPTS.contact,
        operationId: "research:ctc_1",
      },
    ]);
  });

  test("a deal's session is about the deal and asks for its brief", async () => {
    const env = setup();

    env.research.start(alice, "deal", "del_1");
    await settle();

    expect(env.sessions[0]).toMatchObject({
      caller: { record: { kind: "deal", id: "del_1" }, permissionMode: "auto" },
      operationId: "research:del_1",
    });
    expect(env.sessions[0]?.message).toContain("research-deal");
    expect(env.sessions[0]?.message).toContain("write_deal_brief");
  });

  test("skips callers without a workspace or a user, and caps each workspace", async () => {
    const env = setup();

    env.research.start({ userId: "user_alice", activeWorkspaceId: null }, "company", "com_1");
    env.research.start({ userId: "user_ghost", activeWorkspaceId: "ws_a" }, "company", "com_2");

    for (let index = 0; index <= RESEARCH_LIMIT; index += 1) {
      env.research.start(alice, "company", `com_${index + 10}`);
    }

    await settle();
    expect(env.sessions).toHaveLength(RESEARCH_LIMIT - 1);

    env.advance(RESEARCH_WINDOW_MS);
    env.research.start(alice, "company", "com_late");
    await settle();
    expect(env.sessions.at(-1)?.operationId).toBe("research:com_late");
  });

  test("a failed start is logged, never thrown", async () => {
    const logged: string[] = [];

    const research = makeResearch({
      startSession: async () => {
        throw new Error("agent down");
      },
      user: async () => ({ name: "Alice", email: "alice@a.test" }),
      log: (message) => logged.push(message),
    });

    research.start(alice, "company", "com_1");
    await settle();
    await settle();

    expect(logged).toEqual(["research: company com_1"]);
  });

  test("the sweep researches records whose start was missed, once a day each", async () => {
    const sessions: string[] = [];

    const research = makeResearch({
      startSession: async (_caller, _message, operationId) => {
        sessions.push(operationId);
      },
      user: async () => ({ name: "Alice", email: "alice@a.test" }),
      log: () => {},
      now: () => Date.parse("2026-11-27T09:00:00Z"),
      pending: async () => [
        { kind: "contact", id: "ctc_1", workspaceId: "ws_a", userId: "user_alice" },
        { kind: "company", id: "com_1", workspaceId: "ws_a", userId: "user_alice" },
      ],
    });

    expect(await research.sweep()).toBe(2);
    expect(sessions).toEqual(["research:ctc_1:2026-11-27", "research:com_1:2026-11-27"]);
  });
});
