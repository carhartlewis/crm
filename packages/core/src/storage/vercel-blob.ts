import { del, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { assertValidKey, type PutOptions, type Storage } from "./types.ts";

/** How long the browser has to start an upload. */
const CLIENT_UPLOAD_MS = 10 * 60 * 1000;

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
    keyOf: (url) =>
      URL.canParse(url) && new URL(url).hostname.endsWith(BLOB_HOST)
        ? decodeURIComponent(new URL(url).pathname.slice(1))
        : null,
    async clientUpload(key, { contentType, maxBytes }) {
      assertValidKey(key);

      const clientToken = await generateClientTokenFromReadWriteToken({
        token,
        pathname: key,
        allowedContentTypes: [contentType],
        maximumSizeInBytes: maxBytes,
        validUntil: Date.now() + CLIENT_UPLOAD_MS,
        addRandomSuffix: false,
        allowOverwrite: false,
      });

      return { pathname: key, token: clientToken };
    },
  };
}
