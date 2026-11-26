import { createRedisKv, type Kv as KvStore } from "@crm/core/kv";
import { RedisClient } from "bun";
import { Context, Effect, Layer, Redacted } from "effect";
import { AppConfig } from "../config.ts";

/** Redis-backed KV through Bun's native client. The connection closes with the layer. */
export class Kv extends Context.Service<Kv, KvStore>()("@crm/api/services/Kv") {
  static readonly layer = Layer.effect(
    Kv,
    Effect.gen(function* () {
      const { redisUrl } = yield* AppConfig;

      const client = yield* Effect.acquireRelease(
        Effect.sync(() => new RedisClient(Redacted.value(redisUrl))),
        (redis) => Effect.sync(() => redis.close()),
      );

      return createRedisKv(client, "crm");
    }),
  );
}
