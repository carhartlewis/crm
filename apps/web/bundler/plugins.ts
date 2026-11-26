import { transformAsync } from "@babel/core";
import type { BunPlugin } from "bun";
import reactCompiler from "babel-plugin-react-compiler";

/**
 * React → TanStack Redact. Mirrors the alias table in Redact's bundler core
 * (@tanstack/redact/dist/bundler-core/selection.js), which ships Vite, Webpack and
 * Rspack plugins but no Bun one. Application code keeps standard React imports.
 */
const REDACT_ALIASES = {
  "use-sync-external-store/shim/with-selector": "@tanstack/redact",
  "use-sync-external-store/shim/with-selector.js": "@tanstack/redact",
  "use-sync-external-store/with-selector": "@tanstack/redact",
  "use-sync-external-store/with-selector.js": "@tanstack/redact",
  "use-sync-external-store/shim/index.js": "@tanstack/redact",
  "use-sync-external-store/index.js": "@tanstack/redact",
  "use-sync-external-store/shim": "@tanstack/redact",
  "use-sync-external-store": "@tanstack/redact",
  "react/jsx-runtime": "@tanstack/redact/jsx-runtime",
  "react/jsx-dev-runtime": "@tanstack/redact/jsx-dev-runtime",
  "react/compiler-runtime": "@tanstack/redact/compiler-runtime",
  "react-dom/profiling": "@tanstack/redact/dom-profiling",
  "react-dom/client": "@tanstack/redact/dom-client",
  "react-dom/test-utils": "@tanstack/redact/dom-test-utils",
  "react-dom": "@tanstack/redact/dom",
  react: "@tanstack/redact",
  scheduler: "@tanstack/redact/scheduler",
} as const;

export type Renderer = "redact" | "react-dom";

/** Production builds: Redact unless `RENDERER=react-dom` (same-commit comparison). */
export function rendererFromEnv(value: string | undefined): Renderer {
  return value === "react-dom" ? "react-dom" : "redact";
}

/**
 * Dev server: React DOM unless `RENDERER=redact`. Bun's dev server re-emits plugin-resolved
 * modules on every rebuild, so with the Redact alias every hot update includes Redact's own
 * runtime modules, which cannot self-accept, and Bun falls back to a full page reload.
 * React DOM keeps real Fast Refresh (state survives edits). Verify Redact with a build.
 */
export function devRendererFromEnv(value: string | undefined): Renderer {
  return value === "redact" ? "redact" : "react-dom";
}

export function redactPlugin(): BunPlugin {
  const resolved = new Map(
    Object.entries(REDACT_ALIASES).map(([from, to]) => [
      from,
      Bun.resolveSync(to, import.meta.dir),
    ]),
  );

  return {
    name: "redact",
    setup(build) {
      build.onResolve(
        { filter: /^(react|react-dom|scheduler|use-sync-external-store)(\/.*)?$/ },
        (args) => {
          const path = resolved.get(args.path);

          return path ? { path } : undefined;
        },
      );
    },
  };
}

/**
 * React Compiler over first-party source (this app and workspace packages), never
 * node_modules. Babel only parses TS/JSX here; Bun still does the TS/JSX transform.
 */
export function reactCompilerPlugin(): BunPlugin {
  return {
    name: "react-compiler",
    setup(build) {
      build.onLoad({ filter: /\/(apps|packages)\/[^/]+\/src\/.*\.tsx$/ }, async (args) => {
        const source = await Bun.file(args.path).text();

        const result = await transformAsync(source, {
          filename: args.path,
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ["typescript", "jsx"] },
          plugins: [[reactCompiler, { target: "19" }]],
          sourceMaps: "inline",
        });

        return { contents: result?.code ?? source, loader: "tsx" };
      });
    },
  };
}

export function appPlugins(renderer: Renderer): BunPlugin[] {
  return renderer === "redact" ? [reactCompilerPlugin(), redactPlugin()] : [reactCompilerPlugin()];
}
