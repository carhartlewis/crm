# Chat: New chat, spaces, folders

Decision record: [ADR 0018](../../docs/adr/0018-chats-spaces-and-folders.md). Reference: Glass
(screenshots in the request of 2026-11-26).

## Problem

The agent has no screen. Home only links to pages that the sidebar already shows. People can't
keep, find or share a conversation with the agent.

## Outcome

1. The sidebar starts with **New chat**. It opens `/`: "What's on your mind?", a composer and a
   space picker. Home has no row.
2. Sending the first message makes a chat, opens `/chats/<id>` and streams the answer. The
   first token arrives without waiting for a session to start (prewarmed session).
3. Every chat shows in the sidebar: in **Recents**, in a **Folder**, or **Pinned**.
4. A chat is **Private** or in a shared **Space**. Everyone in the workspace sees, reads and
   writes in a shared chat.
5. Opening a chat you hovered in the sidebar shows its messages in the first frame.

## Users and permissions

| Action                                    | Who                                                    |
| ----------------------------------------- | ------------------------------------------------------ |
| See, read, send in a private chat         | The person who started it                              |
| See, read, send in a shared chat          | Every member of the workspace                          |
| Rename, move between shared spaces        | Anyone who sees the chat                               |
| Make private, delete                      | The person who started it                              |
| Make a space                              | Any member                                             |
| Rename or delete a space                  | The person who made it, or a workspace owner or admin |
| Pin, unpin, folders, order                | Each user, for their own sidebar only                 |

Deleting a space makes its chats private to the people who started them.

## Screens

### Sidebar

```
[ New chat ]                 (⌥0, hotkey in tooltip)
Pinned
  Companies          ⌥1
  Contacts           ⌥2
  Team pipeline ■    ⌥3      (a pinned space)
  Q4 forecast        ⌥4      (a pinned chat)
Spaces
  ■ Private
  ■ Sales
  + Add space
Folders
  ▸ Renewals
      Chat A
Recents
  Chat B
  Chat C
```

- The `…` menu on a chat: Pin/Unpin, Move to folder ▸ (folders, New folder…, Remove from
  folder), Move to space ▸ (Private, spaces), Rename, Delete.
- The `…` menu on a space: Pin/Unpin, Rename, Delete (if allowed).
- The `…` menu on a folder: Rename, Delete (its chats go back to Recents).
- Hover on a chat preloads its route and history.

### New chat (`/`)

- Heading "What's on your mind?" (balanced).
- Space picker above the composer: Private (default) or a shared space. Opening a space's page
  and then New chat picks that space (`?space=<id>`).
- Composer: AI Elements `PromptInput` in `BorderBeam`. Enter sends, Shift+Enter adds a line.
- The page asks the API for a prewarmed session on mount.

### Chat (`/chats/$chatId`)

- Header: sidebar toggle, chat title (select-text), space badge, `…` menu.
- AI Elements `Conversation` with `Message`s: user text, assistant Markdown (streaming), tool
  calls (`Tool`), reasoning (`Reasoning`), approvals for write tools.
- Composer at the bottom. While the agent works, the submit button stops the turn.
- In a shared chat each user message shows its sender's name and avatar.

### Space (`/spaces/$spaceId`, `/spaces/private`)

- Title, a New chat button for this space, the chats of the space, newest first.

## API

All JSON endpoints are in `@crm/core/api` group `chats`, behind `Authentication`.

| Method and path                         | Does                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/chats/prewarm`               | Creates (or keeps) a prewarmed eve session for the caller. 204.                                        |
| `POST /api/chats`                       | `{ id, title, spaceId }`. Takes the prewarmed session or creates one. Returns `{ txid, sessionId }`. |
| `PATCH /api/chats/:id`                  | `{ title?, spaceId? }`. Returns `{ txid }`.                                                            |
| `DELETE /api/chats/:id`                 | Deletes the row, ends the eve session, drops the cached history. Returns `{ txid }`.                  |
| `GET /api/chats/:id/history`            | `{ session: { sessionId, streamIndex }, events }`. Redis first, then the new lines from eve.         |
| `POST /api/chat-spaces`                 | `{ id, name, color }`. Returns `{ txid }`.                                                             |
| `PATCH /api/chat-spaces/:id`            | `{ name?, color? }`. Returns `{ txid }`.                                                               |
| `DELETE /api/chat-spaces/:id`           | Returns `{ txid }`.                                                                                    |
| `PUT /api/sidebar`                      | `{ id, pinned, folders }`. Upserts the caller's row. Returns `{ txid }`.                              |
| `* /api/chats/:id/agent/eve/v1/session/:sessionId[/…]` | The agent proxy (raw route). Not `POST /eve/v1/session`.                                 |

Shapes: `/api/shapes/chats`, `/api/shapes/chat-spaces`, `/api/shapes/sidebar`.

Each message through the proxy sets `chat.last_message_at`.

## Agent

- `channels/eve.ts`: `auth: [crmProxy(AGENT_PROXY_SECRET), localDev()]`.
- `agent.ts`: `limits.sessionTimeoutMs: false`, `experimental.workflow.retention: "default"`.
- Env: `AGENT_PROXY_SECRET` on both the API and the agent (32+ characters).

## Performance targets

- New chat to first token: no session start on the critical path (prewarm hit).
- Hovered chat to messages on screen: one frame after navigation (history in the query cache).
- Cold chat (not hovered): one API round trip to Redis plus a bounded eve read of new lines.
- Cold entry unchanged: AI Elements, eve's client and Markdown load with the chat routes only.

## Out of scope (follow-ups)

See `issues/`. Feed cards on New chat (as in Glass), drag and drop into folders, ⌘K search over
chats, attachments and voice in the composer, members per space, archiving transcripts in
Postgres.
