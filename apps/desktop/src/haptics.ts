/** The one call we use from `macos-haptics` (an optional, macOS-only N-API addon). */
export interface HapticEngine {
  performAlignment(): void;
}

export interface HapticsOptions {
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
  /** Loads the native engine: `nativeHaptics(require)` in the app, a fake in tests. */
  readonly load: () => HapticEngine;
  /** Taps closer together than this merge into one; the trackpad can't render them apart. */
  readonly minIntervalMs?: number;
}

function isEngine(value: unknown): value is HapticEngine {
  return (
    value instanceof Object &&
    "performAlignment" in value &&
    value.performAlignment instanceof Object
  );
}

/**
 * Loads `macos-haptics` through `require`, which must resolve from the app's own directory
 * (`createRequire(<app path>/package.json)`): the bundler bakes `import.meta.url` into the build
 * as the source path, which is wrong on every other machine.
 */
export function nativeHaptics(require: NodeJS.Require): HapticEngine {
  const engine: unknown = require("macos-haptics");

  if (!isEngine(engine)) throw new Error("macos-haptics: unexpected exports");

  return engine;
}

/**
 * Trackpad haptics. Loads the addon lazily on first use and only on macOS; if it's missing or
 * fails to load (another OS, an unsupported build), haptics turn into a silent no-op.
 */
export function createHaptics({ platform, now, load, minIntervalMs = 30 }: HapticsOptions) {
  let engine: HapticEngine | null | undefined = platform === "darwin" ? undefined : null;
  let last = Number.NEGATIVE_INFINITY;

  return {
    perform() {
      if (engine === undefined) {
        try {
          engine = load();
        } catch {
          engine = null;
        }
      }

      if (!engine || now() - last < minIntervalMs) return;

      last = now();

      try {
        engine.performAlignment();
      } catch {
        engine = null;
      }
    },
  };
}
