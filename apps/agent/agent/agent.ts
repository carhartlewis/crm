import { defineAgent, defineDynamic } from "eve";
import { pickModel } from "./lib/pick-model.ts";

export default defineAgent({
  // Through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`): GLM 5.3 Fast, or Claude Haiku 5.5 once
  // the person attaches an image (`pickModel`).
  model: defineDynamic(async (ctx) => pickModel(await ctx.messages())),
  // GLM thinks at length by default: long thinking slows each step, and sometimes it spends the
  // whole step thinking and answers nothing ("The model did not return a response").
  reasoning: "low",
  // Chats stay in the sidebar (ADR 0018): no idle end, and eve keeps private transcripts
  // instead of requesting their deletion outside development.
  limits: { sessionTimeoutMs: false },
  experimental: { workflow: { retention: "default" } },
});
