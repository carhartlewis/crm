import type { Kv } from "@crm/core/kv";
import { createClient } from "redis";

/**
 * `Kv` over node-redis. The API uses Bun's native client (`createRedisKv`), but eve bundles the
 * agent for Node, where `bun` can't be imported. Keys share the API's `crm:` prefix scheme.
 */
export function createNodeRedisKv(url: string, prefix: string): Kv {
  const client = createClient({ url });
  const ready = client.connect().then(() => client);
  const key = (name: string) => `${prefix}:${name}`;

  return {
    get: async (name) => (await ready).get(key(name)),
    async set(name, value, ttlSeconds) {
      await (await ready).set(key(name), value, ttlSeconds === undefined ? {} : { EX: ttlSeconds });
    },
    take: async (name) => (await ready).getDel(key(name)),
    async increment(name, ttlSeconds) {
      const redis = await ready;

      const [count] = await redis
        .multi()
        .incr(key(name))
        .expire(key(name), ttlSeconds, "NX")
        .exec();

      return Number(count);
    },
    async delete(name) {
      await (await ready).del(key(name));
    },
  };
}
