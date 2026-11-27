import type { Storage } from "./types.ts";

export interface ImageCacheDependencies {
  storage: Storage;
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  /** Per-download limit, so a slow host can't hold up sign-in. */
  timeoutMs?: number;
  maxBytes?: number;
}

export interface ImageCache {
  /** True when `url` already points at our storage. */
  isStored(url: string): boolean;
  /** Copies a user's profile picture. `null` when there is none or it isn't a usable image. */
  avatar(userId: string, source: string): Promise<string | null>;
  /** Copies a website's favicon, shared by every workspace on that host. */
  favicon(website: string): Promise<string | null>;
}

/**
 * Copies remote images (Google profile pictures, website favicons) into our storage, so the
 * app serves them from one origin and doesn't depend on third-party hotlinking.
 * Only raster formats are kept: an SVG can carry script.
 */
export function createImageCache({
  storage,
  fetch: fetchImpl = fetch,
  timeoutMs = 5000,
  maxBytes = 1024 * 1024,
}: ImageCacheDependencies): ImageCache {
  async function copy(key: string, source: string | null) {
    if (!source) return null;

    const response = await fetchImpl(source, { signal: AbortSignal.timeout(timeoutMs) });

    if (!response.ok || !response.body) return null;

    const bytes = await readAtMost(response.body, maxBytes);
    const contentType = bytes && sniffImageType(bytes);

    if (!bytes || !contentType) return null;

    const stored = await storage.put(key, bytes, { contentType });

    // Keys are stable, so the version busts browser and CDN caches when the image changes.
    return `${stored.url}?v=${shortHash(bytes)}`;
  }

  return {
    isStored: (url) => storage.isStored(url),
    avatar: (userId, source) => copy(`users/${userId}/avatar`, avatarSource(source)),
    favicon: (website) => {
      const host = websiteHost(website);

      return copy(`favicons/${host}`, host && faviconSource(host));
    },
  };
}

/** https only; Google avatars are asked for at 256px instead of the default 96px. */
export function avatarSource(image: string) {
  if (!URL.canParse(image)) return null;

  const url = new URL(image);

  if (url.protocol !== "https:") return null;

  if (url.hostname.endsWith(".googleusercontent.com")) {
    url.pathname = url.pathname.replace(/=s\d+(-c)?$/, "=s256-c");
  }

  return url.href;
}

function websiteHost(website: string) {
  return URL.canParse(website) ? new URL(website).hostname.toLowerCase() || null : null;
}

/**
 * Google's favicon service rather than the site itself: the website is user input, and
 * fetching it from the server would let anyone make the API request internal addresses.
 * It answers 404 when the site has no icon.
 */
export function faviconSource(host: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

async function readAtMost(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of body) {
    size += chunk.byteLength;

    if (size > maxBytes) {
      await body.cancel().catch(() => {});

      return null;
    }

    chunks.push(chunk);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** The image type from its magic bytes; the server's Content-Type isn't trusted. */
export function sniffImageType(bytes: Uint8Array) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";

  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";

  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";

  return null;
}

function shortHash(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 16);
}
