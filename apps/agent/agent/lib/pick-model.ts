/** Quick tool use with a 1M context, but it reads no images. */
export const CHAT_MODEL = "zai/glm-5.3-fast";

/**
 * Reads images and PDFs; used only once a conversation holds one. It must have a zero-retention
 * provider on the gateway (GLM 5.3 FlashX has none, so the gateway refuses it).
 */
export const VISION_MODEL = "anthropic/claude-haiku-5.5";

/** The parts of a model message this choice reads. */
interface ContentPart {
  readonly type: string;
  readonly mediaType?: string;
}

interface ModelMessage {
  readonly role: string;
  readonly content: string | readonly ContentPart[];
}

/** What the fast model can't read but eve sends as bytes: images and PDFs. */
const needsVision = (part: ContentPart) =>
  part.type === "image" ||
  (part.type === "file" &&
    (part.mediaType?.startsWith("image/") === true || part.mediaType === "application/pdf"));

/**
 * The fast model, until the person attaches an image or a PDF. The model sees earlier
 * attachments on every call, so from then on the chat stays on the vision model.
 */
export function pickModel(messages: readonly ModelMessage[]) {
  const needsReader = messages.some(
    (message) =>
      message.role === "user" &&
      Array.isArray(message.content) &&
      message.content.some(needsVision),
  );

  return needsReader ? VISION_MODEL : CHAT_MODEL;
}
