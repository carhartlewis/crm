import { Config, Redacted, Schema } from "effect";

/** Process configuration, read once at startup through Effect's ConfigProvider (env by default). */
export const AppConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3001)),
  databaseUrl: Config.Redacted("DATABASE_URL"),
  redisUrl: Config.Redacted("REDIS_URL"),
  // Required and ≥32 chars: an empty secret makes better-auth fall back to its public default
  // (it only refuses that when NODE_ENV=production, which Bun doesn't set).
  authSecret: Config.schema(
    Schema.Redacted(Schema.String.check(Schema.isMinLength(32))),
    "BETTER_AUTH_SECRET",
  ),
  authUrl: Config.URL("BETTER_AUTH_URL"),
  webOrigin: Config.URL("WEB_ORIGIN"),
  googleClientId: Config.NonEmptyString("GOOGLE_CLIENT_ID"),
  googleClientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
  // Electric is reached only by the shape proxy; it must never be exposed to browsers.
  electricUrl: Config.URL("ELECTRIC_URL").pipe(
    Config.withDefault(new URL("http://127.0.0.1:53000")),
  ),
  // Required: without it Electric would serve any table to anyone who can reach it.
  electricSecret: Config.schema(
    Schema.Redacted(Schema.String.check(Schema.isMinLength(16))),
    "ELECTRIC_SECRET",
  ),
  // Image storage: Vercel Blob when its token is set, otherwise the S3-compatible store. The
  // S3 defaults match the local RustFS container in compose.yaml.
  blobToken: Config.option(Config.Redacted("BLOB_READ_WRITE_TOKEN")),
  // context.dev brand data: square logos for workspaces and connected apps. Optional; without
  // it, logos fall back to favicons.
  contextDevApiKey: Config.option(Config.Redacted("CONTEXT_DEV_API_KEY")),
  // treg: people search, email and phone finding, and person and company enrichment through one
  // token in front of many data providers (ADR 0027). Optional; without it the tools are hidden.
  tregToken: Config.option(Config.Redacted("TREG_TOKEN")),
  tregUrl: Config.String("TREG_URL").pipe(Config.withDefault("https://treg.to")),
  // Supermemory: workspace and company memory (ADR 0014). Optional; without it, memory is off.
  supermemoryApiKey: Config.option(Config.Redacted("SUPERMEMORY_API_KEY")),
  /** The Vercel AI Gateway, for Jev's judgements (the AI SDK reads it from the environment). */
  aiGatewayApiKey: Config.option(Config.Redacted("AI_GATEWAY_API_KEY")),
  // Separates environments that share one Supermemory account; defaults to a hash of the
  // auth URL's origin.
  memoryPrefix: Config.option(
    Config.schema(
      Schema.String.check(Schema.isPattern(/^[a-z0-9]{1,16}$/)),
      "MEMORY_NAMESPACE_PREFIX",
    ),
  ),
  s3: Config.all({
    bucket: Config.String("S3_BUCKET").pipe(Config.withDefault("crm")),
    endpoint: Config.String("S3_ENDPOINT").pipe(Config.withDefault("http://127.0.0.1:59000")),
    region: Config.String("S3_REGION").pipe(Config.withDefault("us-east-1")),
    accessKeyId: Config.String("S3_ACCESS_KEY_ID").pipe(Config.withDefault("crm-local")),
    secretAccessKey: Config.Redacted("S3_SECRET_ACCESS_KEY").pipe(
      Config.withDefault(Redacted.make("crm-local-secret")),
    ),
    // The URL browsers load objects from: the bucket's base URL.
    publicUrl: Config.String("S3_PUBLIC_URL").pipe(
      Config.withDefault("http://127.0.0.1:59000/crm"),
    ),
  }),
  // The eve agent's origin. Its sign-in callback is the only redirect the MCP authorization
  // server accepts for the agent client (see @crm/core/auth/mcp).
  agentUrl: Config.URL("AGENT_URL").pipe(Config.withDefault(new URL("http://localhost:2000"))),
  // Shared with the agent: it accepts chat requests only with this secret (ADR 0018). Optional;
  // without it, chats are off.
  agentProxySecret: Config.option(
    Config.schema(
      Schema.Redacted(Schema.String.check(Schema.isMinLength(32))),
      "AGENT_PROXY_SECRET",
    ),
  ),
});
