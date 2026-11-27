import { assertValidKey, encodeKey, type PutOptions, type Storage } from "./types.ts";

const MEMORY_URL = "memory://storage/";

export interface MemoryObject {
  bytes: Uint8Array;
  contentType: string;
}

/** In-process storage for tests. `read` exposes what was written. */
export function createMemoryStorage() {
  const objects = new Map<string, MemoryObject>();

  return {
    driver: "memory",
    async put(key: string, body: Uint8Array, options: PutOptions) {
      assertValidKey(key);
      objects.set(key, { bytes: new Uint8Array(body), contentType: options.contentType });

      return { key, url: `${MEMORY_URL}${encodeKey(key)}` };
    },
    async delete(key: string) {
      assertValidKey(key);
      objects.delete(key);
    },
    isStored: (url: string) => url.startsWith(MEMORY_URL),
    keyOf: (url: string) =>
      url.startsWith(MEMORY_URL) ? decodeURIComponent(url.slice(MEMORY_URL.length)) : null,
    clientUpload: async () => null,
    read: (key: string) => objects.get(key) ?? null,
  } satisfies Storage & { read(key: string): MemoryObject | null };
}
