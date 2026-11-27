# 0020: Space membership

**Status:** accepted (2026-11). Supersedes the "who sees a chat" and sidebar parts of
[0018](0018-chats-spaces-and-folders.md).

## Context

In ADR 0018 every member of a workspace saw every chat in every space, and the sidebar listed all
spaces. As in Glass, people want to find spaces, join the ones they work in, pin some to the
sidebar, and leave the rest.

## Decision

- **Membership** is a row in `chat_space_member` (space, user, workspace, when they joined),
  synced per workspace. The person who makes a space joins it in the same transaction. Anyone in
  the workspace can join any space and leave it again.
- **Who sees a chat:** the person who started it, and the members of its space. The API checks
  this on every chat call (`canSee`), and the chat shape uses the same rule with a subquery:
  `workspace_id = $1 AND (created_by_id = $2 OR space_id IN (SELECT space_id FROM
  chat_space_member WHERE user_id = $2))`. Electric moves chats in and out of the shape when you
  join or leave.
- **Spaces themselves** (name, description, colour) are listed to everyone in the workspace, so
  people can find them. A space has a description of up to 280 characters.
- A chat starts in, or moves into, only a space you joined.
- **Recents** holds the chats you started and the chats in spaces you joined.
- **Screens:** Spaces is a page (`/spaces`), reached from a row under New chat. Each space has a
  pin icon and Join or Leave there. A space's page header holds New chat, Pin, Join or Leave, and
  a menu with Edit and Delete. New and Edit space open the side sheet (`?create=space` for new).
  In the sidebar, a pinned space shows Unpin and Leave on hover, and a chat shows Pin or Unpin;
  a chat's other actions are in its page header.
- ⌘K searches spaces by name and description, and has Spaces and New space.

## Consequences

- Spaces are open: joining needs no invitation. Spaces only some people may join need an owner
  or invite rule and a new ADR.
- Leaving a space hides its chats at once, including chats you took part in but didn't start.
- Spaces made before this change have no members; their makers join them from the Spaces page.
