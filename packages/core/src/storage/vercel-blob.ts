import { del, put } from "@vercel/blob";
import { assertValidKey, type PutOptions, type Storage } from "./types.ts";

const BLOB_HOST = ".public.blob.vercel-storage.com";

/** Vercel Blob public store. Used when `BLOB_READ_WRITE_TOKEN` is set. */
export function createVercelBlobStorage(token: string): Storage {
  return {
    driver: "vercel-blob",
    async put(key: string, body: Uint8Array, { contentType }: PutOptions) {
      assertValidKey(key);

      const result = await put(key, Buffer.from(body), {
        access: "public",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
      });

      return { key, url: result.url };
    },
    async delete(key: string) {
      assertValidKey(key);
      await del(key, { token });
    },
    isStored: (url) => URL.canParse(url) && new URL(url).hostname.endsWith(BLOB_HOST),
  };
}
