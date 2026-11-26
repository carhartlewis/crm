import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// Direct Anthropic access; reads ANTHROPIC_API_KEY (or a local `/login` credential in dev).
export default defineAgent({
  model: anthropic(),
});
