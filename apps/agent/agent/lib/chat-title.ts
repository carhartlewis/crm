import { chatTitlePrompt, cleanGeneratedTitle } from "@crm/core/chat";

/** The first turn of a chat, as the title step reads it. */
export interface FirstTurn {
  readonly sessionId: string;
  readonly message: string;
  readonly reply: string;
}

export interface ChatTitleOptions {
  /** A small model's answer to a prompt (Claude Haiku on the AI Gateway). */
  readonly generate: (prompt: string, signal: AbortSignal) => Promise<string>;
  /** Saves the title on the chat through the CRM API. */
  readonly save: (sessionId: string, title: string, signal: AbortSignal) => Promise<void>;
  readonly log?: (message: string, cause?: unknown) => void;
}

/**
 * Names a chat after its first turn (ADR 0018). The CRM first titles a chat with the start of its
 * first message; this asks a small model for a short title and saves it. The API keeps it only
 * while no person has renamed the chat. A failure leaves the first title in place.
 */
export async function nameChat(turn: FirstTurn, options: ChatTitleOptions, signal: AbortSignal) {
  if (!turn.message.trim()) return;

  try {
    const title = cleanGeneratedTitle(
      await options.generate(chatTitlePrompt(turn.message, turn.reply), signal),
    );

    if (title) await options.save(turn.sessionId, title, signal);
  } catch (cause) {
    options.log?.("chat title: naming the chat failed", cause);
  }
}
