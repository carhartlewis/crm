# 0022: Plan mode

**Status:** accepted (2026-11). Adds a mode to [0019](0019-chat-permission-modes.md).

## Context

For bigger tasks the person wants to see what the agent will change before anything changes, as
in T3 Code's plan mode. Manual asks before each change, one card at a time, so the person sees the
plan only piece by piece.

## Decision

- **Plan is a fourth permission mode** (`plan`, first in the menu). Reads run; every change and
  risky call is refused (`callDecision` returns `refuse`), and the agent reads a reason that tells
  it to add the step to its plan instead.
- **The agent plans.** While the chat is in Plan, a dynamic system instruction
  (`agent/instructions/plan.ts`) tells it to research with read-only tools and end with a numbered
  list of the changes it will make.
- **Run plan.** Under a finished reply in Plan, a Run plan button switches the chat to Auto,
  waits until the server has saved the mode, then sends "Run the plan." The API forwards the new
  mode with that message.
- Plan is not remembered as the mode new chats start in: it is for one task at a time.

## Consequences

- A plan runs in Auto, so risky steps still ask. A person who wants every step to ask switches to
  Manual and types "Run the plan" instead.
- The agent's own memory saving (Jev) is not a tool call, so it still runs in Plan.
