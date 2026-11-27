# Architecture decision records

Short records of decisions that are settled, and why. Rules live in `AGENTS.md`; these explain them. To change one, add a new ADR that supersedes it rather than editing history.

| ADR                                                | Decision                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [0001](0001-bun-toolchain-and-same-origin-api.md)  | Bun canary as runtime, bundler, test runner; the API is served same-origin under `/api`  |
| [0002](0002-redact-in-builds-react-dom-in-dev.md)  | Redact renders production builds; the dev server uses React DOM                          |
| [0003](0003-tailwind-not-stylex.md)                | shadcn/ui on Tailwind v4 tokens; StyleX dropped                                          |
| [0004](0004-effect-api-contract-not-trpc.md)       | Effect `HttpApi` contract in `@crm/core/api`; no tRPC                                    |
| [0005](0005-prisma-8-owns-the-schema.md)           | Prisma 8 owns the schema and migrations, including better-auth's tables                  |
| [0006](0006-better-auth-sessions.md)               | Google-only better-auth, sessions in Redis, no cookie cache, workspaces as organizations |
| [0007](0007-desktop-sign-in-handoff.md)            | Desktop sign-in: system browser, loopback, state, PKCE, single-use code                  |
| [0008](0008-no-direct-effects.md)                  | No direct effects; data loads before render; forms via TanStack Form + mutations         |
| [0009](0009-router-core-hmr-patch.md)              | Temporary patch to `@tanstack/router-core` for Bun HMR                                   |
| [0010](0010-carbon-icons-per-icon-modules.md)      | Carbon icons from per-icon modules                                                       |
| [0011](0011-guards-own-auth-navigation.md)         | Directory routes with one guard per pathless layout; auth changes re-run guards          |
| [0012](0012-electric-sync-behind-the-api.md)       | Electric behind the authenticated API proxy; workspace-scoped shapes; client ids; txids  |
| [0013](0013-connections-through-an-mcp-gateway.md) | Connected apps and workspace skills reach the agent through better-auth MCP tokens       |
