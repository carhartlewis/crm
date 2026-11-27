# Replace a chat's stranded eve session

Status: open

A deploy that changes the eve version strands the sessions it did not build: a message to one answers `409 session_stranded` (on a local world, a restart without `eve dev --resume` leaves them dormant and a message fails with 500). The chat then can't continue.

When the agent proxy gets that answer for a message, the API should: read the old session's recorded events (bounded read still works, and the Redis copy exists), create a new session, store its id on the chat (`chat.session_id`, keeping the old id for history), and resend the message. The new session needs the old conversation: pass the previous session id to the agent (a caller attribute), and add a dynamic user-role instruction that reads it with `sessions.attach(...).stream({ follow: false })` and `transcriptOf()` (eve docs: "What a replacement session receives"). The chat page then shows both sessions' events.

Until then, `eve dev` runs with `--resume`, and the chat page shows a failed send as a toast.
