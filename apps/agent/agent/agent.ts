import { defineAgent, defineDynamic } from "eve";
import { pickModel } from "./lib/pick-model.ts";

export default defineAgent({
  // Through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`): GLM 5.3 Fast, or Claude Haiku 5.5 once
  // the person attaches an image (`pickModel`).
  model: defineDynamic(async (ctx) => pickModel(await ctx.messages())),
  // Chats stay in the sidebar (ADR 0018): no idle end, and eve keeps private transcripts
  // instead of requesting their deletion outside development.
  limits: { sessionTimeoutMs: false },
  experimental: { workflow: { retention: "default" } },
});
