import {
  chatTitlePrompt,
  cleanGeneratedTitle,
  TITLE_NEEDS_REPLY,
  type TitleSource,
} from "@crm/core/chat";
import type { CrmCaller } from "./crm-caller.ts";

/**
 * Whether the session has a chat to name: a turn from the CRM carries its workspace. Background
 * research (ADR 0025) runs in a session the API starts without a chat row, so naming it costs a
 * model call and the API answers 404.
 */
export function hasChat(caller: CrmCaller | null): caller is CrmCaller {
  return Boolean(caller?.workspaceId) && caller?.origin !== "research";
}

/** A chat's first message (and, the second time, the reply), as the title step reads it. */
export interface FirstMessage extends TitleSource {
  readonly sessionId: string;
}

export interface ChatTitleOptions {
  /** A small model's answer to a prompt (Claude Haiku on the AI Gateway). */
  readonly generate: (prompt: string, signal: AbortSignal) => Promise<string>;
  /** Saves the title on the chat through the CRM API. */
  readonly save: (sessionId: string, title: string, signal: AbortSignal) => Promise<void>;
  readonly log?: (message: string, cause?: unknown) => void;
}

/** `waiting`: the message alone can't name the chat; ask again with the reply. */
export type NameOutcome = "named" | "waiting" | "unnamed";

/**
 * Names a chat from its first message (ADR 0018), as soon as it arrives: the CRM first titles a
 * chat with the start of that message; this asks a small model for a short title while the reply
 * is written, and saves it. A message that points at something it doesn't name ("who is this
 * person?") comes back `waiting`; call again with the reply when the turn ends. The API keeps a
 * title only while no person has renamed the chat. A failure leaves the first title in place.
 */
export async function nameChat(
  turn: FirstMessage,
  options: ChatTitleOptions,
  signal: AbortSignal,
): Promise<NameOutcome> {
  const filenames = turn.filenames ?? [];

  if (!turn.message.trim() && filenames.length === 0) return "unnamed";

  try {
    const title = cleanGeneratedTitle(await options.generate(chatTitlePrompt(turn), signal));

    if (title === TITLE_NEEDS_REPLY) return turn.reply === undefined ? "waiting" : "unnamed";

    if (!title) return "unnamed";

    await options.save(turn.sessionId, title, signal);

    return "named";
  } catch (cause) {
    options.log?.("chat title: naming the chat failed", cause);

    return "unnamed";
  }
}
