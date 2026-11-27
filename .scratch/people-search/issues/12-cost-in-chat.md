# Cost in the chat

Status: resolved
Type: task
Blocked by: 03, 11
Spec: ../spec.md

Show what each call cost, as the chat shows turn time and steps now.

- `tool-steps.ts` reads `_meta["crm/usage"]` from a tool result. `ToolCalls` puts the price at
  the end of the step line ("Found 18 people · $0.24"). A cache hit shows "Saved" and a miss
  shows "No charge".
- `turnSummaries` (`chat-view.tsx`) adds the turn's sum: "Worked for 14s · 5 steps · $0.31",
  shown only when the sum is above zero.
- The chat menu shows "Usage in this chat" from synced `usage_event` rows by `chatId`.
- The record Agent tab shows the cost per research run.
- Tabular numbers. No animation on cost labels.

## Answer

Price per step (`ToolStep` cost), turn summary sum, chat total line, record spend in the Agent tab.
