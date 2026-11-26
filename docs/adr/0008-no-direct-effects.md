# 0008: No direct effects; data before render

**Status:** accepted (2026-11)

## Decision

- No `useEffect`, `useLayoutEffect` or `useInsertionEffect` (lint: `crm/no-direct-effect`, a local Oxlint plugin, because `no-restricted-imports` can't spare `import * as React`). Follow the `no-use-effect` skill.
- The one escape hatch is `useMountEffect` for mount-time subscriptions to external systems, with `useEffectEvent` to read the latest props. Browser state (theme, media queries) uses `useSyncExternalStore`.
- The app is client-rendered by design, so "SSR-first" here means **route-first**: data loads in `beforeLoad`/`loader` via `queryClient.fetchQuery` and is read with `useSuspenseQuery`. Guards use `fetchQuery`, not `ensureQueryData`, because the latter returns stale data after invalidation (this caused a real redirect bug).
- Forms use TanStack Form with `revalidateLogic` (`onDynamic` validators: on blur or submit, then live after a submit) and TanStack Query `mutationOptions`. Plain `onSubmit` field validators left stale errors that blocked valid submits.

## Consequences

No effect-driven fetching, flags or derived state. Form and route code are declarative; heavy route components go in `.lazy.tsx` files to stay out of cold entry.
