# 0015: Workspace skills start enabled

**Status:** accepted (2026-11). Supersedes the "A new skill starts disabled" rule in the
[0013](0013-connections-through-an-mcp-gateway.md) skills addendum.

## Context

ADR 0013 made a skill from skills.sh start disabled, so that a member reads it before it steers
the agent. In practice the member who adds a skill has just chosen it, and the skill opens for
them at once. The extra "Enable for the workspace" step added friction and left skills that were
added but never used.

## Decision

- **A new skill starts enabled**, from skills.sh or written in the CRM. It opens after it is
  added, so the member who added it sees its instructions.
- Any member can still disable or remove a skill. The agent still loads only enabled skills.

## Consequences

- A skill steers the agent from the turn after it is added, without a second member's review.
  The pinned copy, the size and file limits, and safe paths from 0013 still apply.
