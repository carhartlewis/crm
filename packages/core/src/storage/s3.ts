import { S3Client } from "bun";
import { assertValidKey, encodeKey, type PutOptions, type Storage } from "./types.ts";

/** Objects live under this prefix; the bucket policy makes only it publicly readable. */
const PUBLIC_PREFIX = "public";

export interface S3Options {
  bucket: string;
  /** S3-compatible endpoint, e.g. the local RustFS container. Omit for AWS. */
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Base URL that serves the bucket's objects, e.g. `http://localhost:59000/crm`. */
  publicUrl: string;
}

/** S3-compatible storage through Bun's native client (no SDK dependency). */
export function createS3Storage(options: S3Options): Storage {
  const client = new S3Client({
    bucket: options.bucket,
    endpoint: options.endpoint,
    region: options.region,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
  });

  const base = `${options.publicUrl.replace(/\/+$/, "")}/${PUBLIC_PREFIX}/`;

  return {
    driver: "s3",
    async put(key: string, body: Uint8Array, { contentType }: PutOptions) {
      assertValidKey(key);
      await client.write(`${PUBLIC_PREFIX}/${key}`, body, { type: contentType });

      return { key, url: `${base}${encodeKey(key)}` };
    },
    async delete(key: string) {
      assertValidKey(key);
      await client.delete(`${PUBLIC_PREFIX}/${key}`);
    },
    isStored: (url) => url.startsWith(base),
    keyOf: (url) => (url.startsWith(base) ? decodeURIComponent(url.slice(base.length)) : null),
    // Development only: the API takes the bytes itself, with no body limit there.
    clientUpload: async () => null,
  };
}
