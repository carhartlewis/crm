# 0011: Route guards own auth navigation

**Status:** accepted (2026-11)

## Context

Auth redirects lived in three places: the `_authed` guard, a guard on the home page that also checked for a workspace, and `SessionWatcher`, which kept its own list of public paths and navigated by hand. Sign-out and desktop sign-in navigated by hand too. Each new route had to be added to more than one place.

## Decision

- Routes nest in directories, with each layout in `route.tsx` (TanStack Router directory routes).
- One guard per pathless layout: `_guest` (signed-out pages; owns the `?redirect=` param), `_authed` (signed in; `session` in context), `_authed/_workspace` (has an active workspace). A page gets its rules from where it sits.
- When the signed-in user changes, `SessionWatcher` calls `router.invalidate()`. The guards re-run and redirect. Then it removes the previous user's queries (user data is keyed by user id). Components only change auth state (sign out, redeem a code); they never navigate for it.
- Router providers (`QueryClientProvider`) go through `createRouter({ Wrap })`, and the router context has one `RouterContext` type.

## Consequences

Adding a page is one file in the right directory. Auth state has one source of navigation, so tabs, focus refetches and in-page actions behave the same.
