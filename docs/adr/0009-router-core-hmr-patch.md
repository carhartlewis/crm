# 0009: Temporary patch to @tanstack/router-core for Bun HMR

**Status:** accepted (2026-11), temporary

## Context

`@tanstack/router-core` 1.171's `router.js` and `load-client.js` import each other. A dev-only line reads `replaceRouteChunk` while the module body runs. Real ESM handles this, but Bun's HMR module registry hasn't populated the binding yet, so the dev app crashed (`Cannot read properties of null (reading 'replaceRouteChunk')`).

## Decision

Patch that one line to read the binding lazily, via `bun patch` (`patches/@tanstack%2Frouter-core@1.171.39.patch`, applied on every install through `patchedDependencies`).

## Consequences

Remove the patch when Bun or TanStack fixes this, or when upgrading `@tanstack/router-core` (the patch is version-pinned and will fail loudly on a new version).
