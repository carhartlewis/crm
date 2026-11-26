import type { RedisClient } from "bun";

/**
 * Minimal string key-value store. Backed by Redis in deployed environments and
 * by `createMemoryKv` in tests and local tooling. Values are strings so callers
 * own encoding and validation at their own boundary.
 */
export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Atomically read and delete a key. */
  take(key: string): Promise<string | null>;
  /** Atomically increment a counter. The TTL applies only when the key is created. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  delete(key: string): Promise<void>;
}

export type RedisCommands = Pick<RedisClient, "get" | "set" | "getdel" | "del" | "send">;

// INCR and EXPIRE in one script, so a counter can never be left without a TTL.
const INCREMENT_WITH_TTL =
  "local v = redis.call('INCR', KEYS[1]) if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return v";

export function createRedisKv(redis: RedisCommands, prefix: string): Kv {
  const key = (name: string) => `${prefix}:${name}`;

  return {
    get: (name) => redis.get(key(name)),
    async set(name, value, ttlSeconds) {
      await (ttlSeconds === undefined
        ? redis.set(key(name), value)
        : redis.set(key(name), value, "EX", ttlSeconds));
    },
    take: (name) => redis.getdel(key(name)),
    async increment(name, ttlSeconds) {
      const count: number = await redis.send("EVAL", [
        INCREMENT_WITH_TTL,
        "1",
        key(name),
        String(ttlSeconds),
      ]);

      return count;
    },
    async delete(name) {
      await redis.del(key(name));
    },
  };
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/** In-process store with real TTL semantics. `now` is injected for deterministic tests. */
export function createMemoryKv(now: () => number = Date.now): Kv {
  const entries = new Map<string, MemoryEntry>();

  const read = (name: string) => {
    const entry = entries.get(name);

    if (!entry) return null;

    if (entry.expiresAt <= now()) {
      entries.delete(name);

      return null;
    }

    return entry;
  };

  const write = (name: string, value: string, ttlSeconds?: number) => {
    const expiresAt =
      ttlSeconds === undefined ? Number.POSITIVE_INFINITY : now() + ttlSeconds * 1000;

    entries.set(name, { value, expiresAt });
  };

  return {
    async get(name) {
      return read(name)?.value ?? null;
    },
    async set(name, value, ttlSeconds) {
      write(name, value, ttlSeconds);
    },
    async take(name) {
      const value = read(name)?.value ?? null;

      entries.delete(name);

      return value;
    },
    async increment(name, ttlSeconds) {
      const entry = read(name);

      if (!entry) {
        write(name, "1", ttlSeconds);

        return 1;
      }

      const count = Number(entry.value) + 1;

      entry.value = String(count);

      return count;
    },
    async delete(name) {
      entries.delete(name);
    },
  };
}

/**
 * Read-through cache for preloading: serves a cached value, otherwise runs the
 * loader once per key (concurrent callers share the same in-flight load) and
 * stores the result with a TTL.
 */
export function createPreloader(kv: Kv) {
  const inFlight = new Map<string, Promise<string>>();

  return async function preload(
    key: string,
    ttlSeconds: number,
    load: () => Promise<string>,
  ): Promise<string> {
    const cached = await kv.get(key);

    if (cached !== null) return cached;

    const pending = inFlight.get(key);

    if (pending) return pending;

    const loading = load()
      .then(async (value) => {
        await kv.set(key, value, ttlSeconds);

        return value;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, loading);

    return loading;
  };
}
