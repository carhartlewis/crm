import { rm } from "node:fs/promises";
import { join } from "node:path";

const outdir = join(import.meta.dir, "dist");

await rm(outdir, { recursive: true, force: true });

// Electron's main process and sandboxed preload both load CommonJS; workspace code is bundled in.
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "src/main.ts"), join(import.meta.dir, "src/preload.ts")],
  outdir,
  target: "node",
  format: "cjs",
  naming: "[name].cjs",
  // Native addons load from node_modules at runtime; they can't be bundled.
  external: ["electron", "macos-haptics"],
  sourcemap: "linked",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
