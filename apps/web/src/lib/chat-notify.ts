import { Option, Schema } from "effect";

/** Why a chat calls for the person while they look elsewhere. */
export type ChatNoticeKind = "finished" | "input";

export interface ChatNotice {
  readonly title: string;
  readonly body: string;
}

/** Longest body the OS shows on one or two lines. */
const BODY_LIMIT = 140;

/** What a notification says: the chat's title, then the reply's first line or the question. */
export function chatNotice(kind: ChatNoticeKind, chatTitle: string, text: string): ChatNotice {
  const line = text
    .split("\n")
    .map((part) => part.replace(/[#*_`>|]/g, "").trim())
    .find((part) => part.length > 0);

  const fallback = kind === "finished" ? "The reply is ready." : "The assistant needs your input.";
  const body = line ?? fallback;

  return {
    title: kind === "finished" ? chatTitle : `${chatTitle} needs you`,
    body: body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT - 1).trimEnd()}…` : body,
  };
}

/** The fields of `interaction.opened` a notification needs. */
const OpenedInteraction = Schema.Struct({
  type: Schema.Literal("interaction.opened"),
  data: Schema.Struct({
    request: Schema.Struct({
      prompt: Schema.optional(Schema.String),
      title: Schema.optional(Schema.String),
    }),
  }),
  meta: Schema.Struct({ at: Schema.String }),
});

const decodeOpenedInteraction = Schema.decodeUnknownOption(OpenedInteraction);

/**
 * The question in an event that asks the person something, if it was asked after `since`; older
 * ones come from catching up on a chat and were seen already.
 */
export function newQuestion(event: { readonly type: string }, since: number): string | null {
  return Option.match(decodeOpenedInteraction(event), {
    onNone: () => null,
    onSome: ({ data, meta }) =>
      Date.parse(meta.at) < since ? null : (data.request.title ?? data.request.prompt ?? ""),
  });
}

/** Only while the window is in the background: in front, the person already sees it. */
export function shouldNotify(doc: Pick<Document, "hidden" | "hasFocus">) {
  return doc.hidden || !doc.hasFocus();
}

/**
 * Asks once for permission, on a send (a gesture the browser accepts). The desktop app grants it
 * to its own origin without a prompt.
 */
export function askToNotify() {
  if (!("Notification" in globalThis) || Notification.permission !== "default") return;

  void Notification.requestPermission().catch(() => undefined);
}

/** Shows the notice when allowed; a click brings the window, still on the chat, back. */
export function notifyChat(notice: ChatNotice) {
  if (!("Notification" in globalThis) || Notification.permission !== "granted") return;

  if (!shouldNotify(document)) return;

  const shown = new Notification(notice.title, { body: notice.body, silent: false });

  shown.addEventListener(
    "click",
    () => {
      window.focus();
      shown.close();
    },
    { once: true },
  );
}
