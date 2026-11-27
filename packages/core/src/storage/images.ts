import type { Storage } from "./types.ts";

export interface ImageCacheDependencies {
  storage: Storage;
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  /**
   * Square logo URLs for a domain, best first (`createContextDev` from `@crm/core/brand`).
   * Without it, `logo` falls back to the favicon.
   */
  logoSources?: (domain: string) => Promise<readonly string[]>;
  /** Per-download limit, so a slow host can't hold up sign-in. */
  timeoutMs?: number;
  maxBytes?: number;
  /** Contact photos are kept at full size, so they get their own, larger limits. */
  photoTimeoutMs?: number;
  photoMaxBytes?: number;
}

export interface ImageCache {
  /** True when `url` already points at our storage. */
  isStored(url: string): boolean;
  /** Copies a user's profile picture. `null` when there is none or it isn't a usable image. */
  avatar(userId: string, source: string): Promise<string | null>;
  /**
   * Stores a picture a user uploaded as their profile picture. `null` when the bytes are not
   * a PNG, JPEG, GIF, WebP or ICO image, or are larger than the limit.
   */
  uploadAvatar(userId: string, bytes: Uint8Array): Promise<string | null>;
  /**
   * Copies a CRM contact's photo from context.dev's person data. Only `https://media.brand.dev`
   * sources are fetched: the URL comes through the agent, and the server must not fetch others.
   */
  contactPhoto(contactId: string, source: string): Promise<string | null>;
  /** Copies a website's favicon, shared by every workspace on that host. */
  favicon(website: string): Promise<string | null>;
  /**
   * Copies a company's square logo (context.dev), or its favicon when there is none. Stored per
   * host, so workspaces and connected apps on the same domain share it.
   */
  logo(website: string): Promise<string | null>;
}

/**
 * Copies remote images (Google profile pictures, website favicons) into our storage, so the
 * app serves them from one origin and doesn't depend on third-party hotlinking.
 * Only raster formats are kept: an SVG can carry script.
 */
export function createImageCache({
  storage,
  fetch: fetchImpl = fetch,
  logoSources,
  timeoutMs = 5000,
  maxBytes = 1024 * 1024,
  photoTimeoutMs = 20_000,
  photoMaxBytes = 30 * 1024 * 1024,
}: ImageCacheDependencies): ImageCache {
  const defaults = { timeoutMs, maxBytes };
  const photo = { timeoutMs: photoTimeoutMs, maxBytes: photoMaxBytes };

  async function store(key: string, bytes: Uint8Array, limit = maxBytes) {
    const contentType = bytes.byteLength <= limit ? sniffImageType(bytes) : null;

    if (!contentType) return null;

    const stored = await storage.put(key, bytes, { contentType });

    // Keys are stable, so the version busts browser and CDN caches when the image changes.
    return `${stored.url}?v=${shortHash(bytes)}`;
  }

  async function copy(key: string, source: string | null, limits = defaults) {
    if (!source) return null;

    const response = await fetchImpl(source, { signal: AbortSignal.timeout(limits.timeoutMs) });

    if (!response.ok || !response.body) return null;

    const bytes = await readAtMost(response.body, limits.maxBytes);

    return bytes ? store(key, bytes, limits.maxBytes) : null;
  }

  return {
    isStored: (url) => storage.isStored(url),
    avatar: (userId, source) => copy(`users/${userId}/avatar`, avatarSource(source)),
    uploadAvatar: (userId, bytes) => store(`users/${userId}/avatar`, bytes),
    contactPhoto: (contactId, source) =>
      copy(`contacts/${contactId}/photo`, contactPhotoSource(source), photo),
    favicon: (website) => {
      const host = websiteHost(website);

      return copy(`favicons/${host}`, host && faviconSource(host));
    },
    logo: async (website) => {
      const host = websiteHost(website);

      if (!host) return null;

      // An SVG or a dead link fails the copy; try the next candidate (at most three).
      for (const source of ((await logoSources?.(host)) ?? []).slice(0, 3)) {
        // oxlint-disable-next-line no-await-in-loop -- stop at the first logo that stores.
        const stored = await copy(`logos/${host}`, source).catch(() => null);

        if (stored) return stored;
      }

      return copy(`favicons/${host}`, faviconSource(host));
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

/**
 * The hosts contact photos are copied from, each with the path its photos live under: context.dev
 * (`PERSON_PHOTO_PATTERN` in `@crm/core/brand`), LinkedIn's media host, and the image host one
 * profile provider uses (ADR 0027). The URL comes through the agent, so the server fetches no
 * other host.
 */
const PERSON_PHOTO_HOSTS = new Map([
  ["media.brand.dev", "/pfp/"],
  ["media.licdn.com", "/dms/image/"],
  ["img.imagecdn.dev", "/profile/"],
]);

/** The photo URL when it is an https URL on a person photo host, otherwise null. */
export function contactPhotoSource(source: string) {
  if (!URL.canParse(source)) return null;

  const url = new URL(source);
  const path = PERSON_PHOTO_HOSTS.get(url.hostname);

  return url.protocol === "https:" && !url.port && path && url.pathname.startsWith(path)
    ? url.href
    : null;
}

/** Whether a contact photo may be copied from `source`. */
export const isPersonPhotoSource = (source: string) => contactPhotoSource(source) !== null;

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
