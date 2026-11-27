import { conversation } from "eve/events";
import { defineHook } from "eve/hooks";
import { nameChat } from "../lib/chat-title.ts";
import { crmCaller } from "../lib/crm-caller.ts";
import { crmToken } from "../lib/crm-token.ts";
import { apiUrl } from "../lib/gateway.ts";

/** Small, fast and cheap: a title is a few words. */
const TITLE_MODEL = process.env["CHAT_TITLE_MODEL"] ?? "zai/glm-5.3-flash";

/** A title that takes longer than this isn't worth waiting for; the first title stays. */
const TITLE_TIMEOUT_MS = 15_000;

/**
 * When a chat's first message arrives, a small model names it for the sidebar while the agent
 * writes the reply (ADR 0018). Only for chats from the CRM: the caller carries the chat's
 * workspace, and the API checks the rest.
 */
export default defineHook({
  events: {
    async "delivery.consumed"(event, ctx) {
      // The first turn only: later messages keep the chat's name.
      const first = conversation(ctx.view)[0];

      if (!first || first.turnId !== event.data.turnId) return;

      const caller = crmCaller(ctx.session.auth.current);

      if (!caller?.workspaceId) return;

      const message = event.data.parts
        .flatMap((part) => (part.kind === "text" ? [part.text] : []))
        .join("\n");

      // Not awaited: eve waits for a hook before the turn goes on, and the reply must not wait
      // for the title. If the hook runs twice, the API keeps the first title (`auto_title`).
      void (async () => {
        const { generateText } = await import("ai");

        await nameChat(
          { sessionId: ctx.session.id, message },
          {
            generate: async (prompt, abortSignal) =>
              (await generateText({ model: TITLE_MODEL, prompt, maxOutputTokens: 30, abortSignal }))
                .text,
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
          },
          AbortSignal.timeout(TITLE_TIMEOUT_MS),
        );
      })().catch((cause: unknown) => console.warn("chat title: naming the chat failed", cause));
    },
  },
});
