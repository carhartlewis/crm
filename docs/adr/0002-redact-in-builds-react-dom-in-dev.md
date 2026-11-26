# 0002: Redact in production builds, React DOM in dev

**Status:** accepted (2026-11)

## Context

TanStack Redact is a React-19-compatible renderer about a third the size of React DOM. It renders synchronously, so `startTransition` and `useDeferredValue` behave differently. On this app, Redact keeps cold-entry JS around 115 kB brotli; React DOM is about 182 kB, over the 150 kB budget.

Under Bun's dev server, Redact defeats React Fast Refresh: plugin-resolved modules are re-emitted on every rebuild, so each hot update includes Redact's own runtime modules, which can't self-accept, and Bun falls back to a full reload.

## Decision

- Production builds use Redact with React Compiler (`RENDERER=react-dom` builds React DOM from the same commit for comparison).
- The dev server uses React DOM for real Fast Refresh (`RENDERER=redact turbo dev` uses Redact with full reloads).
- Before each release, compare both renderers on the same commit and exercise forms, portals, Suspense navigation, `startTransition` and `useDeferredValue` on a Redact build.

## Consequences

Day-to-day dev doesn't exercise Redact, so renderer-specific bugs show up only in builds. The release comparison is the safeguard.
