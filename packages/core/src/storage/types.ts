export type StorageDriver = "memory" | "s3" | "vercel-blob";

export interface PutOptions {
  contentType: string;
}

export interface StoredObject {
  key: string;
  /** Public URL that serves the object. */
  url: string;
}

/** Public object storage. Keys are slash-separated paths such as `users/<id>/avatar`. */
export interface Storage {
  readonly driver: StorageDriver;
  /** Writes (or overwrites) a publicly readable object. */
  put(key: string, body: Uint8Array, options: PutOptions): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  /** True when this storage serves `url`, so callers don't copy their own objects again. */
  isStored(url: string): boolean;
  /**
   * A token for the browser to upload `key` itself, for files too large to pass through the API,
   * limited to one type and size. Null when uploads go through the API (S3 in development).
   */
  clientUpload(key: string, limits: ClientUploadLimits): Promise<ClientUpload | null>;
  /** The object's key, when `url` is one of this storage's objects. */
  keyOf(url: string): string | null;
}

export interface ClientUploadLimits {
  readonly contentType: string;
  readonly maxBytes: number;
}

export interface ClientUpload {
  readonly pathname: string;
  readonly token: string;
}

/** Rejects keys that are empty, absolute, or that can climb out of their folder. */
export function assertValidKey(key: string): void {
  const valid =
    key.length > 0 &&
    key.length <= 1024 &&
    !key.includes("\\") &&
    !hasControlCharacter(key) &&
    key.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");

  if (!valid) throw new TypeError(`The storage key is not valid: ${JSON.stringify(key)}`);
}

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function hasControlCharacter(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
}
