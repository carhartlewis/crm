import { describe, expect, test } from "bun:test";
import type { EveMessagePart } from "eve/client";
import { messageBlocks, runDetail, runState, type ToolPart } from "./tool-steps.ts";

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

  test("a run is waiting or running while any call is, and failed when one failed", () => {
    expect(runState(["done", "pending", "failed"])).toBe("pending");
    expect(runState(["done", "waiting"])).toBe("waiting");
    expect(runState(["done", "failed", "done"])).toBe("failed");
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
});
