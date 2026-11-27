# Glossary

Shared vocabulary for code, tests, issues and docs. Decisions behind these terms are in `docs/adr/`.

**Workspace**: A customer account in the CRM: a company and its people. Implemented as a better-auth _organization_ (table `workspace`). Say "workspace" in UI copy and new code; better-auth's API keeps the `organization.*` names.

**Member**: A user's membership of a workspace, with a role (`owner`, `admin`, `member`). The creator is the owner.

**Active workspace**: The workspace a session acts in (`session.activeOrganizationId`). Set at sign-in to the most recently joined workspace. Not proof of membership on its own.

**Company**: A CRM record for an organisation a workspace deals with (table `company`): name, optional domain (bare hostname), owner. Belongs to one workspace; synced to the client through a workspace-scoped shape (ADR 0012).

**Shape**: An ElectricSQL stream of the rows of one table that match a filter. The API proxy fixes each shape to the active workspace (ADR 0012).

**txid**: The Postgres transaction id an API write returns. The client keeps its optimistic change until that txid appears in the shape stream.

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

**Pinned**: The sidebar group with the workspace's pages (Companies, Contacts, Workflows), plus the spaces and chats a user pinned, in one order per user (the `sidebar` row, ADR 0018). Each user orders it by dragging; ⌥1–⌥9 open the first nine.

**Peek**: The card that opens when you hover or focus a pinned page: what it holds, its shortcut, and the workspace's members. Its code and data load on hover, before it opens.

**Workspace shell**: The signed-in frame: sidebar, title bar, the current page, ⌘K and the global shortcuts.

**Integration**: An app a user can connect, such as Granola or Superhuman: one entry in the `@crm/integrations` catalog, backed by the app's remote MCP server.

**Connection**: A user's link to an integration in one workspace, with an access level. Its OAuth tokens stay in the API, encrypted.

**Access level**: `read` (only the app's read-only tools) or `write` (all its tools). Chosen per connection; nothing is configured per app.

**Gateway**: The MCP server at `/api/mcp` that gives the agent the tools of the user's connections, named `<app>__<tool>`. better-auth MCP issues its tokens (ADR 0013).

**Skill**: Instructions the agent loads when they apply, shared by everyone in a workspace. Copied from skills.sh or written in the CRM; starts enabled; any member can disable it (ADR 0015).

**Custom connector**: A remote MCP server a workspace added by URL. It must support MCP OAuth; it then works like a built-in integration (ADR 0013).

**Memory**: What the CRM remembers about a subject: the workspace's own company, or one company record. Stored in Supermemory, one namespace per subject (ADR 0014).

**Source**: A document memory reads facts from: website research, a member's note, a chat, a sent email, or a fact the assistant saved. Each has a stable id, so saving it again replaces it.

**Fact**: One statement Supermemory extracted from sources. Members can forget a wrong fact; a newer fact can replace an older one.

**Settings**: Pages under `/settings`; the sidebar swaps to their links. Workspace settings (General, Workspace Memory) are shared by every member; personal settings (Profile: name, picture, theme) are the user's own.

**Memory graph**: Supermemory's canvas of sources and the facts read from them, in Workspace settings → Workspace Memory and on a company's Knowledge tab.

**Jev**: The decision model (`typesafe-ai/jev` on the Vercel AI Gateway) that judges each chat message and sent email: sensitive, lasting, which company, already known, or a correction. Thresholds in `@crm/memory/jev` decide what is kept.

**Chat**: A conversation with the agent (table `chat`), backed by one eve session. Private to the person who started it, or shared in a space (ADR 0018).

**New chat**: The page at `/`: the composer and a space picker. It replaced Home.

**Space**: A shared place for chats (table `chat_space`), with a name, description and colour. Everyone in the workspace can find and join it; its chats are seen by its members (ADR 0020). **Private** is not a space row: it is the chats only you see.

**Space member**: Someone who joined a space (`chat_space_member`). Joining shows the space's chats and adds them to Recents; leaving hides them.

**Folder**: A personal group of chats in the sidebar. Kept in the user's `sidebar` row; teammates never see it.

**Recents**: The sidebar list of the chats you started and the chats in spaces you joined, that are not pinned and not in a folder, newest message first.

**Prewarmed session**: An eve session the API creates before the first message and keeps in Redis for 10 minutes, so a new chat answers sooner.

**Agent proxy**: `/api/chats/<chatId>/agent/*`. The only way a browser reaches the agent; it checks that the caller may see the chat (ADR 0018).

**Permission mode**: How much the agent may do in a chat without asking: Manual (asks before every change), Auto (asks only before risky calls) or Bypass permissions (runs everything). Picked beside Send (ADR 0019).
