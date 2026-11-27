import { defineAgent } from "eve";

export default defineAgent({
  // Through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`). GLM 5.3 Fast: quick tool use with a 1M
  // context. It reads no images; switch to a `vision` model (such as zai/glm-5.3-flashx) before
  // chats accept pasted screenshots.
  model: "zai/glm-5.3-fast",
  // Chats stay in the sidebar (ADR 0018): no idle end, and eve keeps private transcripts
  // instead of requesting their deletion outside development.
  limits: { sessionTimeoutMs: false },
  experimental: { workflow: { retention: "default" } },
});
