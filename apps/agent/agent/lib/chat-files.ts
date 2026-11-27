/** The largest file a chat takes (`CHAT_FILE_BYTES` in `@crm/core/chat`). */
export const CHAT_FILE_BYTES = 30 * 1024 * 1024;

const BLOB_HOST = ".public.blob.vercel-storage.com";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * A file the CRM stored for a chat message: in Vercel Blob, or in the local RustFS in
 * development (plain http, which eve won't download itself). Nothing else is fetched.
 */
export function isChatFileUrl(url: string) {
  if (!URL.canParse(url)) return false;

  const { protocol, hostname, pathname } = new URL(url);

  const ours =
    (protocol === "https:" && hostname.endsWith(BLOB_HOST)) ||
    (protocol === "http:" && LOCAL_HOSTS.has(hostname));

  return ours && pathname.includes("/chat-files/");
}

/** eve's `fetchFile`: the bytes of a chat file, or null for any other URL. */
export async function fetchChatFile(url: string) {
  if (!isChatFileUrl(url)) return null;

  const response = await fetch(url, { redirect: "error" });

  if (!response.ok) throw new Error(`The file could not be read (HTTP ${response.status})`);

  return Buffer.from(await response.arrayBuffer());
}
