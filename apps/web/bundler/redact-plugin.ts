import { devRendererFromEnv, redactPlugin } from "./plugins.ts";

// Dev server entry. A no-op unless RENDERER=redact (see devRendererFromEnv).
export default devRendererFromEnv(Bun.env["RENDERER"]) === "redact"
  ? redactPlugin()
  : { name: "redact-disabled", setup() {} };
