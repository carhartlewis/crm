import { webSearch } from "eve/tools/web_search";

// Exa through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`): no Exa key of our own. Good for
// finding companies, people and recent news. `web_fetch` (eve's default) reads a result's page;
// `connections__crm__read_web_page` (context.dev) reads pages that need JavaScript.
export default webSearch({ provider: "exa" });
