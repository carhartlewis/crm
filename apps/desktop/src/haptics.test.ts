import { describe, expect, test } from "bun:test";
import { createHaptics } from "./haptics.ts";

function clock(start = 0) {
  let time = start;

  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe("createHaptics", () => {
  test("performs on macOS and merges taps inside the minimum interval", () => {
    const time = clock();
    let taps = 0;

    const haptics = createHaptics({
      platform: "darwin",
      now: time.now,
      load: () => ({ performAlignment: () => (taps += 1) }),
    });

    haptics.perform();
    haptics.perform();
    time.advance(30);
    haptics.perform();

    expect(taps).toBe(2);
  });

  test("never loads the addon on other platforms", () => {
    let loaded = false;

    const haptics = createHaptics({
      platform: "win32",
      now: clock().now,
      load: () => {
        loaded = true;

        return { performAlignment: () => undefined };
      },
    });

    haptics.perform();

    expect(loaded).toBe(false);
  });

  test("becomes a no-op when the addon fails to load, and tries only once", () => {
    let attempts = 0;

    const haptics = createHaptics({
      platform: "darwin",
      now: clock().now,
      load: () => {
        attempts += 1;
        throw new Error("not built for this arch");
      },
    });

    haptics.perform();
    haptics.perform();

    expect(attempts).toBe(1);
  });
});
