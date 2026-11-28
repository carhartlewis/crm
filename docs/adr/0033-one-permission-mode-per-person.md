# 0033: One permission mode per person

**Status:** accepted (2026-11). Changes the mode rule in
[0019](0019-chat-permission-modes.md).

## Context

Each chat kept its own mode, and a new chat started in the mode last picked on that device. A
member who picked Bypass in one chat still found Manual in their other chats, in record sheets'
Agent tabs, and in every chat on another device (the desktop app and a browser keep separate
`localStorage`). They expect the mode to be their setting, not one chat's.

## Decision

- **Picking Manual, Auto or Bypass changes every chat the person sees** in the workspace: their own
  chats and the chats in spaces they joined (`canSee`), in the same transaction as the change
  (`setModeForUser`). Starting a chat in one of those modes does the same.
- **Plan stays one chat's mode.** Picking Plan changes only that chat. A chat in Plan keeps it when
  another chat's mode changes, and leaves Plan when its plan runs, which picks a mode like any
  other change.
- **A new chat starts in the person's mode, read from the synced chats** (the newest mode change
  that isn't Plan), so every device agrees. The last pick on this device stands in only until a
  chat has synced.
- `chat.permission_mode` stays the mode the agent hears for each turn; the API still sends it with
  every forwarded request.

## Consequences

- A member's pick also changes space chats that other members see, as 0019 already allowed one
  chat at a time. The mode shows in each composer, so the person sending can see it.
- The person's mode lives only on chat rows. Someone with no chats has no synced mode until their
  first chat, so their device's last pick applies.
