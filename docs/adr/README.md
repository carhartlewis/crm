# Architecture decision records

Short records of decisions that are settled, and why. Rules live in `AGENTS.md`; these explain them. To change one, add a new ADR that supersedes it rather than editing history.

| ADR                                                 | Decision                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [0001](0001-bun-toolchain-and-same-origin-api.md)   | Bun canary as runtime, bundler, test runner; the API is served same-origin under `/api`                                              |
| [0002](0002-redact-in-builds-react-dom-in-dev.md)   | Redact renders production builds; the dev server uses React DOM                                                                      |
| [0003](0003-tailwind-not-stylex.md)                 | shadcn/ui on Tailwind v4 tokens; StyleX dropped                                                                                      |
| [0004](0004-effect-api-contract-not-trpc.md)        | Effect `HttpApi` contract in `@crm/core/api`; no tRPC                                                                                |
| [0005](0005-prisma-8-owns-the-schema.md)            | Prisma 8 owns the schema and migrations, including better-auth's tables                                                              |
| [0006](0006-better-auth-sessions.md)                | Google-only better-auth, sessions in Redis, no cookie cache, workspaces as organizations                                             |
| [0007](0007-desktop-sign-in-handoff.md)             | Desktop sign-in: system browser, loopback, state, PKCE, single-use code                                                              |
| [0008](0008-no-direct-effects.md)                   | No direct effects; data loads before render; forms via TanStack Form + mutations                                                     |
| [0009](0009-router-core-hmr-patch.md)               | Temporary patch to `@tanstack/router-core` for Bun HMR                                                                               |
| [0010](0010-carbon-icons-per-icon-modules.md)       | Carbon icons from per-icon modules                                                                                                   |
| [0011](0011-guards-own-auth-navigation.md)          | Directory routes with one guard per pathless layout; auth changes re-run guards                                                      |
| [0012](0012-electric-sync-behind-the-api.md)        | Electric behind the authenticated API proxy; workspace-scoped shapes; client ids; txids. Connections, connectors and skills sync too |
| [0013](0013-connections-through-an-mcp-gateway.md)  | Connected apps and workspace skills reach the agent through better-auth MCP tokens                                                   |
| [0014](0014-workspace-and-company-memory.md)        | Workspace and company memory in Supermemory; Jev in the agent decides what chats add                                                 |
| [0015](0015-skills-start-enabled.md)                | Workspace skills start enabled; any member can disable one                                                                           |
| [0016](0016-prefixed-record-ids.md)                 | Record ids are a registered prefix plus 24 base62 characters; older UUIDs stay valid                                                 |
| [0017](0017-memory-fact-copy-for-search.md)         | Memory facts are copied into a synced table so ⌘K searches them locally; refreshed on demand                                         |
| [0018](0018-chats-spaces-and-folders.md)            | Agent chats: `/` is New chat; chats in private or shared spaces, personal pins and folders; eve only behind the API proxy            |
| [0019](0019-chat-permission-modes.md)               | Agent chats have a permission mode: Manual, Auto or Bypass permissions; each tool call is a read, change or risky call               |
| [0020](0020-space-membership.md)                    | People join and leave spaces; a space's chats are its members'; Spaces is a page with pin and join                                   |
| [0021](0021-jev-alone-decides-chat-memory.md)       | Jev alone decides what a chat adds, and chats are not saved; the memory graph links every source to one core                         |
| [0022](0022-plan-mode.md)                           | Plan mode: the agent reads and proposes a plan, changes nothing; Run plan switches the chat to Auto                                  |
| [0023](0023-contacts-deals-and-activity.md)         | Contacts, deals, deal contacts and activity; one field rule set in `@crm/core/records`; logos copied per company                     |
| [0024](0024-fields-money-views-intel-tracking.md)   | Custom fields as rows; reporting currency with stored base amounts; saved views; agent-written contact intel; opt-in tracking        |
| [0025](0025-records-fill-themselves.md)             | New records research themselves in the background; sure facts apply at once, Jev guards members' values; photos from context.dev     |
| [0026](0026-research-is-the-graph-core.md)          | The record's website research is the memory graph's core, so the record sits at the centre; a drawn core only until it lands         |
| [0027](0027-enrichment-through-treg.md)             | People search, emails, phones and enrichment through treg; a usage ledger per workspace; costs shown in chats                        |
| [0028](0028-shared-enrichment-cache.md)             | treg and context.dev answers are cached once for every workspace; a hit is free                                                      |
| [0029](0029-contact-and-deal-research-is-memory.md) | A contact's brief and a deal's research brief are the record's memory core; deals research themselves when created                   |
