import { CHAT_FILE_BYTES, chatFileTypeOf, fileExtension } from "../chat/index.ts";
import { sniffImageType } from "./images.ts";
import type { Storage } from "./types.ts";

/** A file attached to a chat message, stored where the chat and the agent read it. */
export interface StoredChatFile {
  readonly url: string;
  readonly mediaType: string;
}

/** How the browser sends a file: straight to storage with a token, or through the API. */
export type ChatFileUpload =
  | {
      readonly kind: "direct";
      readonly pathname: string;
      readonly token: string;
      readonly contentType: string;
    }
  | { readonly kind: "api" };

export interface ChatFiles {
  /** Starts an upload. Null when chats don't take the file's type or it is too large. */
  start(chatId: string, filename: string, size: number): Promise<ChatFileUpload | null>;
  /** Stores bytes the API received. Null when they aren't what the name says, or too large. */
  store(chatId: string, filename: string, bytes: Uint8Array): Promise<StoredChatFile | null>;
  /**
   * Checks a file the browser uploaded itself: it must be in this chat's folder and its bytes
   * must match its name. A file that fails is deleted. Null when it fails.
   */
  confirm(chatId: string, filename: string, url: string): Promise<StoredChatFile | null>;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const COMPOUND = [0xd0, 0xcf, 0x11, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46];

function isText(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    return true;
  } catch {
    return false;
  }
}

/**
 * The type of a chat file when its bytes match its name: an image by its magic bytes (not an
 * icon), a PDF, an Office file (a zip, or an old compound file), or valid UTF-8 text. Null for
 * anything else, so HTML, SVG and programs are never stored.
 */
export function chatFileType(bytes: Uint8Array, filename: string): string | null {
  const declared = chatFileTypeOf(filename);

  if (!declared) return null;

  if (declared.startsWith("image/")) return sniffImageType(bytes) === declared ? declared : null;

  if (declared === "application/pdf") return startsWith(bytes, PDF) ? declared : null;

  if (declared.startsWith("text/")) return isText(bytes) ? declared : null;

  const extension = fileExtension(filename);
  const zipped = extension.endsWith("x");

  return startsWith(bytes, zipped ? ZIP : COMPOUND) ? declared : null;
}

/** `chat-files/<chat>/<random>.pdf`: no one can guess it, and a download keeps its extension. */
function chatFileKey(chatId: string, filename: string) {
  return `chat-files/${encodeURIComponent(chatId)}/${crypto.randomUUID()}.${fileExtension(filename)}`;
}

async function readAtMost(response: Response, maxBytes: number) {
  const bytes = new Uint8Array(await response.arrayBuffer());

  return bytes.byteLength <= maxBytes ? bytes : null;
}

export function createChatFiles({
  storage,
  fetch: fetchImpl = fetch,
  maxBytes = CHAT_FILE_BYTES,
}: {
  storage: Storage;
  fetch?: (url: string) => Promise<Response>;
  maxBytes?: number;
}): ChatFiles {
  return {
    async start(chatId, filename, size) {
      const contentType = chatFileTypeOf(filename);

      if (!contentType || size > maxBytes || size <= 0) return null;

      const direct = await storage.clientUpload(chatFileKey(chatId, filename), {
        contentType,
        maxBytes,
      });

      return direct ? { kind: "direct", ...direct, contentType } : { kind: "api" };
    },

    async store(chatId, filename, bytes) {
      const mediaType = bytes.byteLength <= maxBytes ? chatFileType(bytes, filename) : null;

      if (!mediaType) return null;

      const stored = await storage.put(chatFileKey(chatId, filename), bytes, {
        contentType: mediaType,
      });

      return { url: stored.url, mediaType };
    },

    async confirm(chatId, filename, url) {
      const key = storage.keyOf(url);

      if (!key?.startsWith(`chat-files/${encodeURIComponent(chatId)}/`)) return null;

      const response = await fetchImpl(url);
      const bytes = response.ok ? await readAtMost(response, maxBytes) : null;
      const mediaType = bytes && chatFileType(bytes, filename);

      if (mediaType) return { url, mediaType };

      await storage.delete(key);

      return null;
    },
  };
}
