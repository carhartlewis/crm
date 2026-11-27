# Agent proxy and proxy-only agent auth

Status: open
Blocked by: 01

Raw route `/api/chats/:id/agent/eve/v1/session/:sessionId/*`: check the chat, forward to `AGENT_URL` with `AGENT_PROXY_SECRET` and the caller headers, stream the body through, set `last_message_at` on messages. In the agent: `crmProxy` auth, no idle timeout, keep retention. Add `AGENT_PROXY_SECRET` to both `.env.example` files.
