import { describe, expect, test } from "bun:test";
import { authStorage } from "../auth/server.ts";
import { createMemoryKv, createPreloader, createRedisKv, type RedisCommands } from "./index.ts";

function clock() {
  let time = 0;

  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe("memory kv", () => {
  test("expires values after their TTL", async () => {
    const time = clock();
    const kv = createMemoryKv(time.now);

    await kv.set("session:a", "1", 10);
    time.advance(9_999);
    expect(await kv.get("session:a")).toBe("1");
    time.advance(1);
    expect(await kv.get("session:a")).toBeNull();
  });

  test("take reads once", async () => {
    const kv = createMemoryKv();

    await kv.set("verify:a", "token");
    expect(await kv.take("verify:a")).toBe("token");
    expect(await kv.take("verify:a")).toBeNull();
  });

  test("increment keeps the TTL from the first hit", async () => {
    const time = clock();
    const kv = createMemoryKv(time.now);

    expect(await kv.increment("rate:a", 60)).toBe(1);
    time.advance(59_000);
    expect(await kv.increment("rate:a", 60)).toBe(2);
    time.advance(1_000);
    expect(await kv.increment("rate:a", 60)).toBe(1);
  });
});

describe("preloader", () => {
  test("shares one in-flight load and serves the cache afterwards", async () => {
    const kv = createMemoryKv();
    const preload = createPreloader(kv);
    let loads = 0;
    const gate = Promise.withResolvers<void>();

    const load = async () => {
      loads += 1;
      await gate.promise;

      return "palette";
    };

    const first = preload("cmdk:org-1", 30, load);
    const second = preload("cmdk:org-1", 30, load);

    gate.resolve();
    expect(await Promise.all([first, second])).toEqual(["palette", "palette"]);
    expect(await preload("cmdk:org-1", 30, load)).toBe("palette");
    expect(loads).toBe(1);
  });

  test("does not cache failed loads", async () => {
    const kv = createMemoryKv();
    const preload = createPreloader(kv);

    await expect(
      preload("cmdk:org-1", 30, () => Promise.reject(new Error("down"))),
    ).rejects.toThrow("down");
    expect(await preload("cmdk:org-1", 30, async () => "palette")).toBe("palette");
  });
});

describe("redis kv", () => {
  test("namespaces keys and sends TTLs and atomic increments to Redis", async () => {
    const calls: string[][] = [];

    const redis: RedisCommands = {
      get: async (key) => {
        calls.push(["GET", String(key)]);

        return "v";
      },
      set: async (...args: unknown[]) => {
        calls.push(["SET", ...args.map(String)]);

        return "OK";
      },
      getdel: async (key) => {
        calls.push(["GETDEL", String(key)]);

        return null;
      },
      del: async (...keys) => {
        calls.push(["DEL", ...keys.map(String)]);

        return 1;
      },
      send: async (command, args) => {
        calls.push([command, ...args]);

        return 3;
      },
    };

    const kv = createRedisKv(redis, "crm");

    await kv.get("a");
    await kv.set("b", "1", 5);
    await kv.take("c");
    await kv.delete("d");
    expect(await kv.increment("e", 60)).toBe(3);
    expect(calls.map((call) => call.filter((part) => !part.startsWith("local")))).toEqual([
      ["GET", "crm:a"],
      ["SET", "crm:b", "1", "EX", "5"],
      ["GETDEL", "crm:c"],
      ["DEL", "crm:d"],
      ["EVAL", "1", "crm:e", "60"],
    ]);
  });
});

describe("auth storage", () => {
  test("maps better-auth secondary storage onto the kv", async () => {
    const storage = authStorage(createMemoryKv());

    await storage.set("session", "token", 60);
    expect(await storage.get("session")).toBe("token");
    expect(await storage.getAndDelete("session")).toBe("token");
    expect(await storage.get("session")).toBeNull();
    expect(await storage.increment("rate", 60)).toBe(1);
  });
});
