import { reactCompilerPlugin } from "./plugins.ts";

// Dev server entry (bunfig.toml `[serve.static] plugins` loads each module's default export).
export default reactCompilerPlugin();
