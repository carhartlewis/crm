import { describe, expect, test } from "bun:test";
import type { EveMessagePart } from "eve/client";
import {
  formatWorked,
  messageBlocks,
  transcriptUpTo,
  runDetail,
  runState,
  turnSummaries,
  type ToolPart,
} from "./tool-steps.ts";

const call = (
  callId: string,
  label: string,
  input: Readonly<Record<string, string>> = {},
): ToolPart => ({
  type: "tool",
  callId,
  stepIndex: 0,
  kind: "tool",
  name: label.toLowerCase().replaceAll(" ", "_"),
  label: `Connections: ${label}`,
  state: "completed",
  input,
});

const text = (value: string): EveMessagePart => ({ type: "text", id: value, text: value });

/** A finished lookup whose answer says what it cost. */
const paid = (callId: string, priceMicro: number): ToolPart => ({
  type: "tool",
  callId,
  stepIndex: 0,
  kind: "tool",
  name: "find_email",
  label: "Connections: Find email",
  state: "completed",
  input: {},
  output: {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          found: true,
          usage: { usageId: callId, priceMicro, outcome: "hit" },
        }),
      },
    ],
  },
});

const event = (type: string, turnId: string, at: string, outcome?: string) => ({
  type,
  data: { turnId, outcome },
  meta: { at },
});

const reply = (id: string, turnId: string, parts: EveMessagePart[]) => ({
  id,
  role: "assistant" as const,
  metadata: { turnId },
  parts,
});

describe("tool step runs", () => {
  test("consecutive calls to one tool form one run; text or another tool starts a new one", () => {
    const blocks = messageBlocks([
      call("a", "Lookup company"),
      call("b", "Lookup company"),
      call("c", "Web search"),
      text("Found them."),
      call("d", "Update company"),
      call("e", "Update company"),
    ]);

    expect(blocks.map((block) => (block.kind === "calls" ? block.calls.length : "text"))).toEqual([
      2,
      1,
      "text",
      2,
    ]);
  });

  test("hidden housekeeping calls don't break a run", () => {
    const hidden: ToolPart = { ...call("h", "Search tools"), hidden: true };
    const blocks = messageBlocks([call("a", "Web search"), hidden, call("b", "Web search")]);

    expect(blocks).toHaveLength(1);
  });

  test("a run is waiting or running while any call is, and done when one succeeded", () => {
    expect(runState(["done", "pending", "failed"])).toBe("pending");
    expect(runState(["done", "waiting"])).toBe("waiting");
    expect(runState(["done", "failed", "done"])).toBe("done");
    expect(runState(["failed", "denied"])).toBe("failed");
    expect(runState(["denied", "done"])).toBe("done");
    expect(runState(["denied", "denied"])).toBe("denied");
  });

  test("a run names its first two subjects and counts the rest", () => {
    expect(runDetail(["Capgo", "Docspring", "Luthor AI", "Persona AI"])).toBe(
      "Capgo, Docspring and 2 more",
    );
    expect(runDetail(["Capgo", "Capgo"])).toBe("Capgo");
    expect(runDetail([undefined, undefined, undefined])).toBe("3 times");
  });

  test("thinking split across steps shows as one row", () => {
    const blocks = messageBlocks([
      { type: "reasoning", id: "r1", text: "First", state: "done" },
      { type: "reasoning", id: "r2", text: "Then", state: "streaming" },
      text("Answer"),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      kind: "part",
      part: { type: "reasoning", text: "First\n\nThen", state: "streaming" },
    });
  });

  test("a finished turn says how long it worked and how many steps it ran", () => {
    const summaries = turnSummaries(
      [
        event("turn.started", "t1", "2026-11-27T03:00:00.000Z"),
        event("turn.settled", "t1", "2026-11-27T03:00:14.400Z", "completed"),
        event("turn.started", "t2", "2026-11-27T03:01:00.000Z"),
      ],
      [
        reply("m1", "t1", [call("a", "Web search"), call("b", "Web search"), text("Done")]),
        reply("m2", "t2", [call("c", "List companies")]),
      ],
    );

    expect(summaries.get("m1")).toBe("Worked for 14s · 2 steps");
    // Still running: no line yet.
    expect(summaries.has("m2")).toBe(false);
    expect(formatWorked(125_000)).toBe("2m 5s");
  });

  test("a turn's summary adds what its paid lookups cost", () => {
    const summaries = turnSummaries(
      [
        event("turn.started", "t1", "2026-11-27T03:00:00.000Z"),
        event("turn.settled", "t1", "2026-11-27T03:00:14.400Z", "completed"),
      ],
      [reply("m1", "t1", [paid("a", 240_000), paid("b", 70_000), text("Done")])],
    );

    expect(summaries.get("m1")).toBe("Worked for 14s · 2 steps · $0.31");
  });

  test("a branch carries the conversation up to the chosen message, words only", () => {
    const messages = [
      { id: "u1", role: "user" as const, parts: [text("Find Capgo")] },
      {
        id: "a1",
        role: "assistant" as const,
        parts: [call("x", "Lookup company"), text("Found it")],
      },
      { id: "u2", role: "user" as const, parts: [text("Now Docspring")] },
    ];

    expect(transcriptUpTo(messages, "a1")).toBe("Me: Find Capgo\n\nAssistant: Found it");
  });
});
