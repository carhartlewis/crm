import { CHAT_FILE_BYTES, chatFileTypeOf, CHAT_FILE_TYPES } from "@crm/core/chat";
import type { MessageContent } from "eve/client";
import { request } from "./api-fetch.ts";

/** A file the person attached to a message, held in the browser until it is sent. */
export interface Attachment {
  readonly id: string;
  readonly file: File;
  readonly filename: string;
  /** The type it is stored as (`CHAT_FILE_TYPES`). */
  readonly mediaType: string;
  /** An object URL for an image's preview in the composer. */
  readonly previewUrl: string | undefined;
}

/** A file stored for the chat: what the message carries and the chat shows. */
export interface SentFile {
  readonly url: string;
  readonly mediaType: string;
  readonly filename: string;
}

/** Files per message. */
export const MAX_FILES = 10;

/** What the file picker offers: every extension a chat takes. */
export const FILE_ACCEPT = [...CHAT_FILE_TYPES.keys()]
  .map((extension) => `.${extension}`)
  .join(",");

export interface FileCheck {
  readonly accepted: readonly File[];
  /** Why each refused file was refused, for one toast. */
  readonly refused: readonly string[];
}

/** Which of `files` can join the `held` attachments, and why the rest can't. */
export function checkFiles(files: readonly File[], held: number): FileCheck {
  const accepted: File[] = [];
  const refused: string[] = [];

  for (const file of files) {
    if (!chatFileTypeOf(file.name)) refused.push(`${file.name} isn't a file chats take`);
    else if (file.size > CHAT_FILE_BYTES) refused.push(`${file.name} is larger than 30 MB`);
    else if (file.size === 0) refused.push(`${file.name} is empty`);
    else if (held + accepted.length >= MAX_FILES) refused.push(`At most ${MAX_FILES} files`);
    else accepted.push(file);
  }

  return { accepted, refused: [...new Set(refused)] };
}

export function toAttachment(file: File): Attachment {
  const mediaType = chatFileTypeOf(file.name) ?? "application/octet-stream";

  return {
    id: crypto.randomUUID(),
    file,
    filename: file.name,
    mediaType,
    previewUrl: mediaType.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}

/** Frees the previews of attachments the composer no longer holds. */
export function releasePreviews(attachments: readonly Attachment[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

type Upload =
  | { kind: "direct"; pathname: string; token: string; contentType: string }
  | { kind: "api" };

function base64(file: File) {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();

  reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] ?? ""));
  reader.addEventListener("error", () =>
    reject(reader.error ?? new Error("Couldn't read that file")),
  );
  reader.readAsDataURL(file);

  return promise;
}

/**
 * Stores one attachment for the chat. In production the browser uploads to Vercel Blob itself
 * (up to 30 MB, past the API's body limit) and the API checks it; in development the bytes go
 * through the API.
 */
export async function uploadAttachment(chatId: string, attachment: Attachment): Promise<SentFile> {
  const base = `/api/chats/${encodeURIComponent(chatId)}/files`;
  const { filename, file } = attachment;

  const upload = await request<Upload>(base, {
    method: "POST",
    body: JSON.stringify({ filename, size: file.size }),
  });

  if (upload.kind === "api") {
    const stored = await request<{ url: string; mediaType: string }>(`${base}/bytes`, {
      method: "POST",
      body: JSON.stringify({ filename, data: await base64(file) }),
    });

    return { ...stored, filename };
  }

  // Loaded on the first upload only: it stays out of the chat's startup code.
  const { put } = await import("@vercel/blob/client");

  const blob = await put(upload.pathname, file, {
    access: "public",
    token: upload.token,
    contentType: upload.contentType,
    multipart: file.size > 8 * 1024 * 1024,
  });

  const stored = await request<{ url: string; mediaType: string }>(`${base}/confirm`, {
    method: "POST",
    body: JSON.stringify({ filename, url: blob.url }),
  });

  return { ...stored, filename };
}

/** What the agent receives: the text alone, or the text followed by the files, by URL. */
export function messageContent(text: string, files: readonly SentFile[]): MessageContent {
  if (files.length === 0) return text;

  return [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...files.map((file) => ({
      type: "file" as const,
      mediaType: file.mediaType,
      filename: file.filename,
      data: file.url,
    })),
  ];
}
