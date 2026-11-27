import type { ChatHistory } from "@crm/core/api";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { request, send } from "./api-fetch.ts";

/**
 * Chat calls that are not synced (ADR 0018): a chat's saved events, and the prewarmed session.
 * Light on purpose: route loaders and hover handlers import this without TanStack DB or eve.
 */
export const chatKeys = {
  all: ["chats"] as const,
  history: (userId: string, chatId: string) =>
    [...chatKeys.all, userId, chatId, "history"] as const,
};

/**
 * A chat's events and stream cursor: Redis first on the server, then the lines eve added since.
 * The page renders them at once and follows the live stream from the cursor, so a cached copy
 * is always safe to show; it is refetched on each visit.
 */
export const chatHistoryQuery = (userId: string, chatId: string) =>
  queryOptions({
    queryKey: chatKeys.history(userId, chatId),
    queryFn: () => request<ChatHistory>(`/api/chats/${encodeURIComponent(chatId)}/history`),
    staleTime: 0,
  });

/**
 * A brand-new chat has nothing to load: seed its history so the route renders without a round
 * trip, and the composer sends the first message at once.
 */
export function seedNewChat(
  queryClient: QueryClient,
  userId: string,
  chatId: string,
  sessionId: string,
) {
  queryClient.setQueryData(chatHistoryQuery(userId, chatId).queryKey, {
    session: { sessionId, streamIndex: 0 },
    events: [],
  });
}

/** How long a prewarmed session stays useful; the server keeps it for 10 minutes. */
const PREWARM_EVERY_MS = 5 * 60 * 1000;

let lastPrewarm = 0;

/**
 * Asks the API to keep an eve session ready, so the next chat's first message skips session
 * start. Called when New chat opens or is hovered; at most once per five minutes, and failures
 * only cost that head start.
 */
export function prewarmChat(now = Date.now()) {
  if (now - lastPrewarm < PREWARM_EVERY_MS) return;

  lastPrewarm = now;
  void send("/api/chats/prewarm", { method: "POST" }).catch(() => {
    lastPrewarm = 0;
  });
}

/** The prewarmed session was used: the next New chat asks for another one. */
export function prewarmUsed() {
  lastPrewarm = 0;
}

/**
 * The first message of a chat just created on New chat, handed to the chat page in memory: it is
 * temporary state, so it never goes in the URL. The page takes it once.
 */
const outbox = new Map<string, string>();

export function queueFirstMessage(chatId: string, text: string) {
  outbox.set(chatId, text);
}

/** Reads it without taking it: render may run twice; the send takes it once. */
export function peekFirstMessage(chatId: string) {
  return outbox.get(chatId);
}

export function takeFirstMessage(chatId: string) {
  const text = outbox.get(chatId);

  outbox.delete(chatId);

  return text;
}
