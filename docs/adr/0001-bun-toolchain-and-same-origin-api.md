# 0001: Bun toolchain and a same-origin API

**Status:** accepted (2026-11)

## Context

The app is a fast, client-rendered, desktop-first CRM in a Turborepo monorepo. Vite was the default suggestion, but Bun can run, bundle, test and serve TypeScript directly.

## Decision

- Bun on the canary channel (1.4.5 or newer) is the runtime, package manager, bundler (`Bun.build`, `Bun.serve` HTML imports) and test runner. No Vite, no Node build step. Internal packages are Just-in-Time (exports point at `.ts` source).
- The web app talks to the API on its own origin under `/api`. In dev, `apps/web/src/dev.ts` proxies `/api/*` to the API and waits briefly for it to start; in production a reverse proxy does the same.

## Consequences

- Vite-only plugins (TanStack Router code splitting, Redact) need Bun equivalents: the router tree comes from `@tanstack/router-cli`, Redact from a small Bun plugin (`apps/web/bundler/plugins.ts`).
- Same origin means no CORS for the browser, no env vars in client code, and cookies that just work. Bun only inlines `process.env.BUN_PUBLIC_*` in some modes, which is why client code reads no env at all.
- Canary can regress. CI keys its caches on the exact Bun build; if a canary breaks, pin CI to the last good stable release.
