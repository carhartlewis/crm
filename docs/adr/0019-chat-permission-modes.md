# 0019: Permission modes for agent chats

**Status:** accepted (2026-11). Changes the approval rule in
[0018](0018-chats-spaces-and-folders.md) and [0013](0013-connections-through-an-mcp-gateway.md).

## Context

The agent asked before every tool call that was not read-only. In a busy chat that meant an
approval card for each company it created or note it saved. comp-neo lets the person in the chat
choose how much the agent may do on its own, from the composer: Manual, Auto, or Bypass
permissions. We want the same.

## Decision

- **Each chat has a mode** (`chat.permission_mode`, synced): `manual` (the default), `auto` or
  `bypass`. The mode menu sits beside Send, on New chat and in each chat; pressing 1–3 in the open
  menu picks a mode. A new chat starts in the mode the person picked last on this device. Anyone
  who can see a chat can change its mode; the next message uses it.
- **Each call has a kind** (`callKind` in `@crm/core/chat`, after comp-neo's rules):
  - `read`: the tool says it only reads, and its name doesn't say it changes something.
  - `change`: the tool says it isn't read-only and isn't destructive.
  - `risky`: anything else, including tools with no annotations, and names about secrets,
    credentials, queries, money or sending (a name beats the server's hints).
- **The decision** (`callDecision`): reads always run. A change asks in Manual and runs in Auto
  and Bypass. A risky call asks in Manual and Auto, and runs in Bypass, recorded as approved with
  the reason `risky`.
- **Where it runs:** the API sends the chat's mode with every forwarded request
  (`x-crm-permission-mode`); the agent's `crmProxy` auth puts it on the caller, and the
  `connections` approval policy (`agent/lib/call-approval.ts`) decides each MCP call with it. A
  caller with no mode is Manual; a caller who isn't a CRM user is refused.
- The CRM's own tools declare honest hints: reads are read-only; `create_company`,
  `update_company` and `remember` are non-destructive changes; `forget` is destructive.

## Consequences

- Without a risk check, a tool with no annotations is risky, so it asks even in Auto. comp-neo
  asks Jev to judge such calls; we can add that later (Jev is already in the agent).
- Bypass in a shared chat lets every member's turns run risky calls without asking. The mode
  shows in the composer, so the person sending can see it.
- Chats show a risky call that ran in Bypass like any other call for now; marking it in the chat
  is a follow-up.
