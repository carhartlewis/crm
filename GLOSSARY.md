# Glossary

Shared vocabulary for code, tests, issues and docs. Decisions behind these terms are in `docs/adr/`.

**Workspace**: A customer account in the CRM: a company and its people. Implemented as a better-auth _organization_ (table `workspace`). Say "workspace" in UI copy and new code; better-auth's API keeps the `organization.*` names.

**Member**: A user's membership of a workspace, with a role (`owner`, `admin`, `member`). The creator is the owner.

**Active workspace**: The workspace a session acts in (`session.activeOrganizationId`). Set at sign-in to the most recently joined workspace. Not proof of membership on its own.

**Setup**: The `/setup-workspace` step for a signed-in user with no workspace (name + website).

**Session**: A better-auth sign-in, stored in Redis and Postgres and identified by the session cookie. Desktop and browser sessions are separate.

**Desktop handoff**: The desktop sign-in flow (ADR 0007): the system browser signs in with Google, then the app receives a _handoff code_ through its _loopback_ listener and redeems it with its PKCE _verifier_.

**Handoff code**: A single-use, 2-minute code the API gives the desktop app after a fresh sign-in. Stored hashed; only redeemable with the matching verifier.

**Loopback**: The one-shot HTTP listener the desktop app opens on `127.0.0.1:<random port>` to receive the handoff code.

**Guard**: Route `beforeLoad` logic that redirects before render. Each pathless layout guards once: `_guest` (signed out only), `_authed` (signed in; puts `session` in route context) and `_authed/_workspace` (has an active workspace). When the session changes, the app re-runs the guards (`router.invalidate()`) instead of navigating by hand.

**API contract**: The Effect `HttpApi` definition in `@crm/core/api`, shared by server and clients.

**Data contract**: The Prisma 8 schema, `packages/core/src/prisma/contract.prisma`, plus its emitted `contract.json`/`contract.d.ts`.

**Cold entry**: The JS and CSS a first load executes before first render. Budgets: 150 kB JS, 20 kB CSS (brotli), enforced by the web build.

**Renderer**: React DOM or TanStack Redact. Redact in production builds, React DOM in dev (ADR 0002).

**Mount effect**: `useMountEffect`, the only sanctioned effect: subscribing to an external system on mount (ADR 0008).

**Onboarding shell**: The full-window layout for sign-in, setup and route-level states: shader backdrop, app mark, title, content.
