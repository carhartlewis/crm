import type { MessageContent } from "eve/client";

/** An image the person attached to a message, read into memory until it is sent. */
export interface ImageAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  /** The image as a `data:` URL: the preview's source, and what the agent receives. */
  readonly dataUrl: string;
}

/** The formats every model provider reads (eve's inbound attachment rules). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** Larger images reach the model as a label only (eve), and the API request has its own cap. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Images per message. */
export const MAX_IMAGES = 4;

export interface ImageCheck {
  readonly accepted: readonly File[];
  /** Why each refused file was refused, for one toast. */
  readonly refused: readonly string[];
}

/** Which of `files` can join the `held` images already attached, and why the rest can't. */
export function checkImages(files: readonly File[], held: number): ImageCheck {
  const accepted: File[] = [];
  const refused: string[] = [];

  for (const file of files) {
    const known: readonly string[] = IMAGE_TYPES;

    if (!known.includes(file.type)) refused.push(`${file.name} isn't a PNG, JPEG, GIF or WebP`);
    else if (file.size > MAX_IMAGE_BYTES) refused.push(`${file.name} is larger than 3 MB`);
    else if (held + accepted.length >= MAX_IMAGES) refused.push(`At most ${MAX_IMAGES} images`);
    else accepted.push(file);
  }

  return { accepted, refused: [...new Set(refused)] };
}

/** Reads an accepted file into an attachment. */
export function readImage(file: File): Promise<ImageAttachment> {
  const { promise, resolve, reject } = Promise.withResolvers<ImageAttachment>();
  const reader = new FileReader();

  reader.addEventListener("load", () =>
    resolve({
      id: crypto.randomUUID(),
      filename: file.name || "image",
      mediaType: file.type,
      dataUrl: String(reader.result),
    }),
  );
  reader.addEventListener("error", () =>
    reject(reader.error ?? new Error("Couldn't read that image")),
  );
  reader.readAsDataURL(file);

  return promise;
}

/** What the agent receives: the text alone, or the text followed by the images. */
export function messageContent(text: string, images: readonly ImageAttachment[]): MessageContent {
  if (images.length === 0) return text;

  return [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((image) => ({
      type: "file" as const,
      mediaType: image.mediaType,
      filename: image.filename,
      data: image.dataUrl,
    })),
  ];
}
