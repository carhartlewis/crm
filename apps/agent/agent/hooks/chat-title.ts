import { conversation, deliveries, reply } from "eve/events";
import { defineHook } from "eve/hooks";
import { nameChat } from "../lib/chat-title.ts";
import { crmCaller } from "../lib/crm-caller.ts";
import { crmToken } from "../lib/crm-token.ts";
import { apiUrl } from "../lib/gateway.ts";

/** Small, fast and cheap: a title is a few words. */
const TITLE_MODEL = process.env["CHAT_TITLE_MODEL"] ?? "anthropic/claude-haiku-4.5";

/**
 * After a chat's first completed turn, a small model names it for the sidebar (ADR 0018). Only for
 * chats from the CRM: the caller carries the chat's workspace, and the API checks the rest.
 */
export default defineHook({
  events: {
    async "turn.settled"(event, ctx) {
      if (event.data.outcome !== "completed") return;

      const completed = conversation(ctx.view).filter((turn) => turn.outcome === "completed");

      if (completed.length !== 1 || completed[0]?.turnId !== event.data.turnId) return;

      const caller = crmCaller(ctx.session.auth.current);

      if (!caller?.workspaceId) return;

      const message = deliveries(ctx.view, { turnId: event.data.turnId })
        .flatMap((delivery) => delivery.parts ?? [])
        .flatMap((part) => (part.kind === "text" ? [part.text] : []))
        .join("\n");

      const replyText = reply(ctx.view, event.data.turnId)
        .flatMap((part) =>
          part.kind === "text" && String(part.value) === part.value ? [part.value] : [],
        )
        .join("\n");

      // Once per session, even if the hook runs again for the same turn.
      await ctx.memo(`chat-title:${event.data.turnId}`, async () => {
        const { generateText } = await import("ai");

        await nameChat(
          { sessionId: ctx.session.id, message, reply: replyText },
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
          ctx.occurrence.abortSignal,
        );

        return true;
      });
    },
  },
});
