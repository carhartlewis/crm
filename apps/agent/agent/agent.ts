import { defineAgent } from "eve";

export default defineAgent({
  // Through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`). The model must read images: members
  // paste screenshots into chats.
  model: "anthropic/claude-opus-5.5",
  // Chats stay in the sidebar (ADR 0018): no idle end, and eve keeps private transcripts
  // instead of requesting their deletion outside development.
  limits: { sessionTimeoutMs: false },
  experimental: { workflow: { retention: "default" } },
});
