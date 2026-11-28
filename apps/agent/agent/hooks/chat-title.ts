import { conversation, reply } from "eve/events";
import { defineHook } from "eve/hooks";
import { type ChatTitleOptions, type FirstMessage, hasChat, nameChat } from "../lib/chat-title.ts";
import { crmCaller } from "../lib/crm-caller.ts";
import { crmToken } from "../lib/crm-token.ts";
import { apiUrl } from "../lib/gateway.ts";

/**
 * Small and fast: a title is a few words. It has a zero-retention provider on the gateway, as
 * the vision model does (lib/pick-model.ts).
 */
const TITLE_MODEL = process.env["CHAT_TITLE_MODEL"] ?? "anthropic/claude-haiku-5.5";

/**
 * Haiku 5.5 thinks by default, and thinking counts against the output limit: with it on, most
 * titles ran out of tokens and came back empty. Off, a title is about 5 to 20 tokens;
 * `cleanGeneratedTitle` keeps it to 60 characters.
 */
const TITLE_OUTPUT_TOKENS = 40;
const TITLE_PROVIDER_OPTIONS = { anthropic: { thinking: { type: "disabled" } } };

/** A title that takes longer than this isn't worth waiting for; the first title stays. */
const TITLE_TIMEOUT_MS = 15_000;

/**
 * First-turn titles by session until the turn ends: each resolves to the first message when it
 * couldn't name its chat alone ("who is this person?"). A short turn can end before the first
 * title does, so the turn's end waits for it. Kept in memory: if another instance ends the turn,
 * the chat keeps its first title, which is still true.
 */
const firstTitles = new Map<string, Promise<FirstMessage | undefined>>();
const PENDING_LIMIT = 1_000;

function titleOptions(caller: NonNullable<ReturnType<typeof crmCaller>>): ChatTitleOptions {
  return {
    generate: async (prompt, abortSignal) => {
      const { generateText } = await import("ai");

      return (
        await generateText({
          model: TITLE_MODEL,
          prompt,
          maxOutputTokens: TITLE_OUTPUT_TOKENS,
          providerOptions: TITLE_PROVIDER_OPTIONS,
          abortSignal,
        })
      ).text;
    },
    save: async (sessionId, title, signal) => {
      const token = await crmToken(caller);

      if (!token) return;

      const response = await fetch(new URL("/api/agent/chats/title", apiUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sessionId, title }),
        signal,
      });

      if (!response.ok) throw new Error(`The CRM refused the title (${response.status})`);
    },
    log: (text, cause) => console.warn(text, cause),
  };
}

const warn = (cause: unknown) => console.warn("chat title: naming the chat failed", cause);

/**
 * When a chat's first message arrives, a small model names it for the sidebar while the agent
 * writes the reply (ADR 0018). A message too vague to name alone waits for the first turn to end,
 * and the model names the chat from the message and the reply. Only for chats from the CRM: the
 * caller carries the chat's workspace, and the API checks the rest. Background research has no chat.
 *
 * Neither handler awaits the model: eve waits for a hook before the turn goes on, and the reply
 * must not wait for the title. If a hook runs twice, the API keeps the first title (`auto_title`).
 */
export default defineHook({
  events: {
    async "delivery.consumed"(event, ctx) {
      // The first turn only: later messages keep the chat's name.
      const first = conversation(ctx.view)[0];

      if (!first || first.turnId !== event.data.turnId) return;

      const caller = crmCaller(ctx.session.auth.current);

      if (!hasChat(caller)) return;

      const turn: FirstMessage = {
        sessionId: ctx.session.id,
        message: event.data.parts
          .flatMap((part) => (part.kind === "text" ? [part.text] : []))
          .join("\n"),
        filenames: event.data.parts.flatMap((part) =>
          part.kind === "file" && part.filename ? [part.filename] : [],
        ),
      };

      const named = nameChat(turn, titleOptions(caller), AbortSignal.timeout(TITLE_TIMEOUT_MS))
        .then((outcome) => (outcome === "waiting" ? turn : undefined))
        .catch((cause: unknown) => {
          warn(cause);

          return undefined;
        });

      if (firstTitles.size >= PENDING_LIMIT) {
        firstTitles.delete(firstTitles.keys().next().value ?? "");
      }

      firstTitles.set(turn.sessionId, named);
    },
    async "turn.settled"(event, ctx) {
      const named = firstTitles.get(ctx.session.id);

      if (!named || conversation(ctx.view)[0]?.turnId !== event.data.turnId) return;

      firstTitles.delete(ctx.session.id);

      const caller = crmCaller(ctx.session.auth.current);

      // A text part's value is its text.
      const text = reply(ctx.view, event.data.turnId)
        .flatMap((part) => (part.kind === "text" && part.value ? [String(part.value)] : []))
        .join("\n")
        .trim();

      if (!hasChat(caller) || !text) return;

      void (async () => {
        const turn = await named;

        if (turn) {
          await nameChat(
            { ...turn, reply: text },
            titleOptions(caller),
            AbortSignal.timeout(TITLE_TIMEOUT_MS),
          );
        }
      })().catch(warn);
    },
  },
});
