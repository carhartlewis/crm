import { describe, expect, test } from "bun:test";
import { type ReflowRoot, reflowMarker } from "./reflow";

describe("reflow marker", () => {
  test("marks the root and clears it once changes settle", () => {
    const root: ReflowRoot = { dataset: {} };
    const queued: (() => void)[] = [];
    const cleared: (number | undefined)[] = [];

    const mark = reflowMarker<number>(root, {
      set: (run) => queued.push(run),
      clear: (handle) => cleared.push(handle),
    });

    mark();
    mark();

    expect(root.dataset.reflowing).toBe("");
    // The second change restarts the wait.
    expect(cleared).toEqual([undefined, 1]);

    queued.at(-1)?.();

    expect(root.dataset.reflowing).toBeUndefined();
  });
});
