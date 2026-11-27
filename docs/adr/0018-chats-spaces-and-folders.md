# 0018: Chats with the agent, in spaces and folders

**Status:** accepted (2026-11).

## Context

The agent (`apps/agent`, eve) had no screen in the web app. Home was a page of cards that only
linked to the pinned pages, and it had its own row in the sidebar.

We want the agent to be the first thing people see, as in Glass: a **New chat** button at the
top of the sidebar opens a full-size chat. Chats stay in the sidebar. People pin them, put them
in folders, and share them with their team in spaces. Opening a chat must be instant.

Three facts from eve shape the design:

1. eve's route auth tells it _who_ calls, but eve has no access list per session: "your
   application decides who may use a session". Anyone who can reach the agent with a valid
   identity and a session id can read that session.
2. eve keeps the transcript (the session's event stream). Outside development it requests
   deletion of the run data of private sessions when the run ends, and it ends a session after
   30 idle days.
3. A browser client (`useEveAgent` from `eve/react`) can render saved events at once
   (`initialEvents`) and then read only the lines after them (`resume`).

## Decision

### Screens

- **`/` is New chat.** Home has no row in the sidebar any more. The sidebar starts with a
  **New chat** button (⌥0 opens it from anywhere). The page shows "What's on your mind?", the
  composer and a space picker (Private or a shared space).
- **`/chats/$chatId` is one chat**, full size in the content area. The title bar shows the chat
  title. The UI comes from shadcn AI Elements in `@crm/ui/components/ai-elements/*`, with
  Carbon icons and our `@pierre/words` Markdown. The composer is wrapped in `BorderBeam`.
- **`/spaces/$spaceId` lists the chats of one space**; `/spaces/private` lists your private
  chats.

### Sidebar

From top to bottom: **New chat**, **Pinned**, **Spaces**, **Folders**, **Recents**.

- **Pinned** holds pages (Companies, Contacts, Workflows), spaces and chats in one order per
  user. Drag to reorder, as before; ⌥1–⌥9 open the first nine. Pages are always pinned; spaces
  and chats are pinned and unpinned from their menu.
- **Spaces**: Private, then each shared space of the workspace, then **Add space**.
- **Folders**: each folder opens to show its chats. Folders are personal.
- **Recents**: the chats you started that are not pinned and not in a folder, newest message
  first, at most 20.
- Every chat row has a `…` menu: Pin or Unpin, Move to folder, Move to space, Rename, Delete.

### Data

Three tables, each workspace-scoped, synced through the API proxy (ADR 0012):

| Table        | Id prefix | What it holds                                                                                                                       |
| ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `chat`       | `cht`     | Workspace, space (null = private), who started it, title, eve session id, created, updated, last message.                           |
| `chat_space` | `spc`     | Workspace, name, colour, who made it, created.                                                                                      |
| `sidebar`    | `sbr`     | One row per user per workspace: `pinned` (ordered keys such as `page:companies`, `chat:cht_…`, `space:spc_…`) and `folders` (JSON). |

- **A chat is private or shared.** `space_id` null means only the person who started it sees
  it. A chat in a space is seen by every member of the workspace. Spaces have no member lists
  yet.
- **Who may do what.** Any member who sees a chat may read it, send messages, rename it and
  move it between shared spaces. Only the person who started it may make it private or delete
  it. The person who made a space, or a workspace owner or admin, may rename or delete it.
  Deleting a space makes its chats private to the people who started them (`ON DELETE SET
  NULL`).
- **Folders and pins are personal**, in the `sidebar` row, so a teammate never sees your
  layout. A chat is in at most one of your folders. Last write wins on the row; only one person
  writes it.
- **Shapes:** `chat` rows where `workspace_id = $1 AND (space_id IS NOT NULL OR created_by_id =
  $2)`, without `session_id`. `chat_space` rows of the workspace. The caller's own `sidebar`
  row. Moving a chat to Private takes it out of other members' shapes at once.
- The pinned order moves from localStorage into the `sidebar` row, so it follows the user to
  other devices. The first load copies a stored localStorage order into the row.

### The agent is behind the API

- **The browser never reaches the agent directly**, as with Electric. `useEveAgent` uses
  `baseUrl: /api/chats/<chatId>/agent`. The API checks the session, the membership, that the
  caller may see the chat, and that the path names the chat's own eve session. Then it forwards
  the request to `AGENT_URL`. Creating a session through the proxy is refused: only the API
  creates sessions.
- **The agent trusts only the API.** Its eve channel accepts a request only with
  `Authorization: Bearer <AGENT_PROXY_SECRET>`, and it takes the caller (id, name, email) from
  headers the API sets. The cookie check (`crmSession`) is removed: with it, someone who knew a
  session id could read a chat that was later made private. `localDev()` stays for `eve dev`.
- In a shared chat, each message runs as the person who sent it, so connected apps use that
  person's own grants.
- **Connections, skills and memory need no sign-in in a chat.** The API also sends the chat's
  workspace (`x-crm-workspace-id`). For each call to the CRM (the MCP gateway, `/api/agent/skills`,
  `/api/agent/memory/*`) the agent signs the user and that workspace with the shared secret, for
  5 minutes (`@crm/core/auth/agent-token`, `crm1.` tokens). The API checks the signature, the
  expiry and the membership on every call, then treats the token like the agent's MCP token
  (ADR 0013). Callers without a workspace, such as `eve dev`, keep the MCP sign-in.

- **Everything the agent does in the CRM is an MCP tool on our gateway.** Besides connected
  apps, `/api/mcp` serves the CRM's own tools as `crm__<tool>` (`@crm/integrations` gateway
  `local` tools, `apps/api/src/services/crm-tools.ts`): list, get, create and update companies,
  list members, and search, remember and forget memory. Reads carry `readOnlyHint`; the agent
  asks before writes, except `crm__remember`. The memory slot keeps only recall before a turn
  and saving the chat after it. Add a CRM capability as a tool here, never as an agent-local
  tool.

- **Chat titles:** a new chat is first titled with the start of its first message. After the
  first completed turn, the agent's `chat-title` hook asks Claude Haiku 4.5 on the AI Gateway
  (`CHAT_TITLE_MODEL`) for a short title and saves it through `POST /api/agent/chats/title` with
  its agent token. The API keeps it only while `chat.auto_title` is on; a person's rename turns
  it off, so the agent never overwrites a name someone chose.

### Fast

- **The sidebar and chat lists are local.** Chats, spaces and the sidebar row sync through
  Electric into TanStack DB; filters and sorts run with `useLiveQuery`.
- **A session is ready before the first message.** The New chat page (and hovering New chat)
  calls `POST /api/chats/prewarm`. The API creates an eve session for that user and keeps its id
  in Redis (`chat:prewarm:<workspace>:<user>`, 10 minutes). Creating a chat takes that id
  (`take`), so the first message goes to a session that is already running.
- **History loads from Redis first.** `GET /api/chats/:id/history` returns the saved events and
  the stream cursor. The API keeps them in Redis (`chat:history:<chatId>`, 7 days) and on each
  read appends only the lines after the cursor (`stream({ startIndex, follow: false })`). The
  route loader starts this read, so hovering a chat in the sidebar preloads it. The page renders
  the events at once and follows the live stream from the cursor.
- The chat page is a lazy route; AI Elements and the Markdown renderer stay out of cold entry.

### Eve settings

- `limits.sessionTimeoutMs: false`: a chat in the sidebar must not end after 30 idle days.
- `experimental.workflow.retention: "default"`: eve keeps private transcripts. Without it, eve
  requests their deletion outside development.

## Consequences

- eve's store is the only full copy of a transcript; Redis holds a cache. If eve loses a
  session, its chat opens empty. A later ADR can archive events into Postgres.
- The API is in the path of every chat request, including the long NDJSON stream. It streams
  the body through and keeps no state per connection.
- A space is visible to the whole workspace. Spaces with their own members need a shape with a
  subquery or a join table, and a new ADR.
- Pins and folders don't merge between two devices that write at the same moment; the later
  write wins.
- Moving folders and chats by drag and drop, ⌘K search over chats, and a feed of cards on New
  chat (as in Glass) are follow-ups in `.scratch/chat/issues/`.
