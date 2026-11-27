/**
 * Public object storage (server-only). Vercel Blob when a token is configured, otherwise any
 * S3-compatible store: the local RustFS container from compose.yaml, MinIO, or AWS S3.
 */
import { createMemoryStorage } from "./memory.ts";
import { createS3Storage, type S3Options } from "./s3.ts";
import type { Storage } from "./types.ts";
import { createVercelBlobStorage } from "./vercel-blob.ts";

export type StorageConfig =
  | { driver: "memory" }
  | { driver: "vercel-blob"; token: string }
  | ({ driver: "s3" } & S3Options);

export function createStorage(config: StorageConfig): Storage {
  switch (config.driver) {
    case "memory":
      return createMemoryStorage();
    case "vercel-blob":
      return createVercelBlobStorage(config.token);
    case "s3":
      return createS3Storage(config);
  }
}

export { createMemoryStorage, type MemoryObject } from "./memory.ts";

export { type S3Options } from "./s3.ts";

export {
  avatarSource,
  createImageCache,
  faviconSource,
  sniffImageType,
  type ImageCache,
  type ImageCacheDependencies,
} from "./images.ts";

export type { PutOptions, Storage, StorageDriver, StoredObject } from "./types.ts";
