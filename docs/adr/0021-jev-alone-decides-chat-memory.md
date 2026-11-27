# 0021: Jev alone decides what a chat adds; the graph has one core

**Status:** accepted (2026-11). Supersedes the "chats are memory" and graph parts of
[0014](0014-workspace-and-company-memory.md).

## Context

ADR 0014 saved every chat as a Supermemory source, then asked Jev about each message. A chat
that only said "Hello" still became a source, so the memory graph filled with chat nodes that
held no facts. The graph also drew each source as its own island, with nothing to show that
all of it is one workspace's memory. comp-neo does neither: it keeps only what Jev keeps, and
links every source to its workspace.

## Decision

- **The agent never saves a chat.** After each turn, Jev judges the member's messages and the
  emails they sent (ADR 0014's questions and thresholds). Only what Jev keeps is written, as a
  dated note in the member's words. Without an AI Gateway key, nothing from a chat is kept. The
  API's `/api/agent/memory/chats` endpoint is gone. Old `chat` sources stay until a member
  deletes them.
- **The graph has one core.** `GET /api/memory/graph` adds a drawn document, `MEMORY_CORE_ID`,
  named after the workspace (or the company, on its Knowledge tab). Each source's first current
  fact links to it (`derives`). A source with no facts yet hangs off the first linked fact
  (`extends`), as in comp-neo. An empty memory has no core, so the page shows its empty state.
  The core is not stored and does not open as a source.

## Consequences

- Small talk adds nothing to memory, and fewer chat transcripts leave our infrastructure.
- Supermemory no longer extracts facts from whole chats. A fact a member states only in passing,
  which Jev calls not lasting, is lost; members can add a note or ask the assistant to remember.
