import tailwind from "bun-plugin-tailwind";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { checkBudgets } from "./bundler/budget.ts";
import { appPlugins, rendererFromEnv } from "./bundler/plugins.ts";

const renderer = rendererFromEnv(Bun.env["RENDERER"]);

const outdir = join(import.meta.dir, "dist");

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "index.html")],
  outdir,
  target: "browser",
  minify: true,
  splitting: true,
  sourcemap: "linked",
  // Fonts and images as hashed files; inlining them as data URLs bloats first-view CSS.
  loader: { ".woff2": "file", ".png": "file", ".svg": "file" },
  plugins: [tailwind, ...appPlugins(renderer)],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const read = (file: string) => readFileSync(join(outdir, file), "utf8");
const report = checkBudgets(read("index.html"), read);

console.log(`renderer: ${renderer}`);

console.log(`cold-entry JS: ${report.js.brotli} B brotli (${report.js.files.length} files)`);

console.log(`first-view CSS: ${report.css.brotli} B brotli (${report.css.files.length} files)`);

if (report.failures.length > 0) {
  console.error(`Budget exceeded:\n  ${report.failures.join("\n  ")}`);
  process.exit(1);
}
