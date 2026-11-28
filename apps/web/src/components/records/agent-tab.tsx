import add16 from "@carbon/icons/es/add/16.js";
import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import { isPermissionMode, titleFromMessage } from "@crm/core/chat";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useLiveQuery } from "@tanstack/react-db";
import { formatUsage } from "@crm/core/usage";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRecordSpend } from "../../lib/usage.ts";
import { Suspense } from "react";
import { toast } from "sonner";
import type { Attachment } from "../../lib/attachments.ts";
import {
  chatHistoryQuery,
  peekFirstMessage,
  prewarmChat,
  queueFirstMessage,
  seedNewChat,
} from "../../lib/chat-api.ts";
import {
  type Chat,
  chatsCollection,
  startChatMutation,
  updateChatMutation,
} from "../../lib/chats.ts";
import { lastPermissionMode, rememberPermissionMode } from "../../lib/permission-mode.ts";
import { relativeTime } from "../../lib/record-format.ts";
import {
  AGENT_TAB_COPY,
  type AgentPrompt,
  selectRecordChat,
  useSelectedRecordChat,
} from "../../lib/record-agent.ts";
import type { RecordKind } from "../../lib/records.ts";
import { ChatMark } from "../brand.tsx";
import { ChatView } from "../chat/chat-view.tsx";
import { Composer } from "../chat/composer.tsx";

const AddIcon = carbonIcon(add16);
const ChevronIcon = carbonIcon(chevronDown16);

interface RecordChatTarget {
  readonly kind: RecordKind;
  readonly recordId: string;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * Starts a chat about a record (ADR 0024) and shows it in the record's Agent tab: the sheet's
 * Research and Re-enrich buttons, the Activity tab's sync, and the tab's own composer all use it.
 * The first message is sent by the chat view as it mounts, as on New chat.
 */
export function useRecordChat({ kind, recordId, userId, workspaceId }: RecordChatTarget) {
  const queryClient = useQueryClient();

  const start = useMutation({
    ...startChatMutation,
    onSuccess: ({ id, sessionId }, { text, files = [] }) => {
      seedNewChat(queryClient, userId, id, sessionId);
      queueFirstMessage(id, { text, files });
      selectRecordChat(kind, recordId, id);
    },
    onError: (error) => toast.error(error.message),
  });

  const ask = (prompt: AgentPrompt, files: readonly Attachment[] = []) =>
    start.mutate({
      workspaceId,
      userId,
      text: prompt.text,
      title: prompt.title,
      files,
      spaceId: null,
      permissionMode: lastPermissionMode(userId, chatsCollection(workspaceId).toArray),
      record: { kind, id: recordId },
    });

  return { start, ask };
}

/** The record's chats, newest first; they also show in Recents. */
function useRecordChats(workspaceId: string, recordId: string) {
  const chats = useLiveQuery(() => chatsCollection(workspaceId));

  return (chats.data ?? [])
    .filter((chat) => chat.record_id === recordId)
    .toSorted((left, right) => right.last_message_at.localeCompare(left.last_message_at));
}

export type RecordAgentTabProps = RecordChatTarget;

/**
 * A record sheet's Agent tab (Paper: "Company agent tab"): a conversation picker over this
 * record's chats, an empty state with three suggestions, and the chat itself.
 */
export function RecordAgentTab(target: RecordAgentTabProps) {
  const { kind, recordId, userId, workspaceId } = target;
  const copy = AGENT_TAB_COPY[kind];
  const chats = useRecordChats(workspaceId, recordId);
  const selectedId = useSelectedRecordChat(kind, recordId);
  const current = chats.find((chat) => chat.id === selectedId) ?? null;
  // A chat just started is selected before its synced row arrives.
  const openId = current?.id ?? selectedId;
  const { start, ask } = useRecordChat(target);
  const busy = start.isPending;

  const send = (text: string, files: readonly Attachment[] = []) =>
    ask({ text, title: titleFromMessage(text) }, files);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center border-b px-2 select-none">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="min-w-0 flex-1 justify-between" size="sm" variant="ghost">
                <span className="truncate">
                  {current?.title ?? (openId ? "Chat" : "New conversation")}
                </span>
                <ChevronIcon className="shrink-0 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => selectRecordChat(kind, recordId, null)}>
              <AddIcon />
              New conversation
            </DropdownMenuItem>
            {chats.length > 0 ? <DropdownMenuSeparator /> : null}
            {chats.map((chat) => (
              <DropdownMenuItem
                key={chat.id}
                onClick={() => selectRecordChat(kind, recordId, chat.id)}
              >
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(chat.last_message_at)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <RecordSpend recordId={recordId} workspaceId={workspaceId} />
      </div>
      {openId ? (
        <Suspense fallback={<ConversationSkeleton />}>
          <RecordConversation
            chat={current}
            chatId={openId}
            key={openId}
            userId={userId}
            workspaceId={workspaceId}
          />
        </Suspense>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center select-none">
            <ChatMark />
            <p className="font-medium text-base text-balance">{copy.title}</p>
            <p className="text-muted-foreground text-pretty">{copy.description}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {copy.suggestions.map((suggestion) => (
                <Button
                  disabled={busy}
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  onPointerEnter={() => prewarmChat()}
                  size="sm"
                  variant="outline"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4">
            <Composer
              disabled={busy}
              onSend={send}
              onTypingStart={() => prewarmChat()}
              placeholder={copy.placeholder}
              status={busy ? "submitted" : "ready"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** One of the record's chats, embedded: its saved events, then the live stream. */
function RecordConversation({
  chatId,
  chat,
  userId,
  workspaceId,
}: {
  chatId: string;
  chat: Chat | null;
  userId: string;
  workspaceId: string;
}) {
  const { data: history } = useSuspenseQuery(chatHistoryQuery(userId, chatId));

  const update = useMutation({
    ...updateChatMutation,
    onError: (error) => toast.error(error.message),
  });

  const mode =
    chat?.permission_mode ?? lastPermissionMode(userId, chatsCollection(workspaceId).toArray);

  return (
    <ChatView
      chatId={chatId}
      firstMessage={peekFirstMessage(chatId)?.text}
      history={history}
      onPermissionModeChange={(next) => {
        rememberPermissionMode(userId, next);

        return update.mutateAsync({ workspaceId, id: chatId, permissionMode: next });
      }}
      permissionMode={isPermissionMode(mode) ? mode : "manual"}
      title={chat?.title ?? "Chat"}
      userId={userId}
    />
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/**
 * What research and lookups on this record have cost (ADR 0027), after the conversation picker,
 * live from the synced ledger. Nothing until it has a figure.
 */
function RecordSpend({ recordId, workspaceId }: { recordId: string; workspaceId: string }) {
  const data = useRecordSpend(workspaceId, recordId);

  if (data.priceMicro <= 0) return null;

  return (
    <span
      className="shrink-0 px-2 text-xs text-muted-foreground tabular-nums"
      title={`${data.calls} paid ${data.calls === 1 ? "lookup" : "lookups"} on this record`}
    >
      {formatUsage(data.priceMicro)}
    </span>
  );
}
