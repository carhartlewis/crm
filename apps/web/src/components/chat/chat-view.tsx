import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@crm/ui/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@crm/ui/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@crm/ui/components/ai-elements/reasoning";
import { ApprovalCard, type ApprovalItem } from "@crm/ui/patterns/approval-card";
import { ThinkingIndicator } from "@crm/ui/patterns/dot-matrix";
import { ToolStep, ToolStepGroup } from "@crm/ui/patterns/tool-step";
import { Button } from "@crm/ui/components/button";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { chatAgentBase, type ChatHistory } from "@crm/core/api";
import type { EveMessage, EveMessagePart, SessionStreamEvent } from "eve/client";
import type { PermissionMode } from "@crm/core/chat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { toast } from "sonner";
import { chatKeys, takeFirstMessage } from "../../lib/chat-api.ts";
import { PermissionModeMenu } from "./permission-mode-menu.tsx";
import { Composer } from "./composer.tsx";

import {
  messageBlocks,
  runDetail,
  runState,
  shownCall,
  stepDetail,
  stepLabel,
  stepState,
  type ToolPart,
} from "./tool-steps.ts";

type InteractionPart = Extract<EveMessagePart, { type: "interaction" }>;

type Interaction = NonNullable<ToolPart["interaction"]>;

/** Calls waiting on an approval, oldest first, across the conversation. */
function waitingApprovals(messages: readonly EveMessage[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "tool" &&
      part.interaction?.status === "open" &&
      part.interaction.request.kind === "approval"
        ? [{ part, interactionId: part.interaction.interactionId }]
        : [],
    ),
  );
}

export interface ChatViewProps {
  readonly chatId: string;
  readonly userId: string;
  /** The chat's permission mode, and how to change it (ADR 0019). */
  readonly permissionMode: string;
  readonly onPermissionModeChange: (mode: PermissionMode) => void;
  readonly history: ChatHistory;
  /** Typed on New chat: sent once, as soon as the view mounts. */
  readonly firstMessage?: string;
}

/**
 * One chat: the saved events render at once, then the live stream follows from their cursor
 * through the agent proxy (ADR 0018). Remount it (`key`) for another chat.
 */
export function ChatView({
  chatId,
  userId,
  permissionMode,
  onPermissionModeChange,
  history,
  firstMessage,
}: ChatViewProps) {
  const queryClient = useQueryClient();

  // The saved history is behind once the chat moves on; the next visit reads it again.
  const historyChanged = () =>
    queryClient.invalidateQueries({ queryKey: chatKeys.history(userId, chatId) });

  const agent = useEveAgent({
    baseUrl: chatAgentBase(chatId),
    // SAFETY: the API passes eve's stream events through unchanged (`ChatHistory.events`).
    initialEvents: history.events as readonly SessionStreamEvent[],
    initialSession: history.session,
    resume: true,
  });

  // Sends, answers and stops resolve when the server accepts them; a refusal (such as a session
  // the agent can no longer run) shows as a toast, and the optimistic message stays marked failed.
  const send = useMutation({
    mutationFn: (text: string) => agent.send(text),
    onSettled: historyChanged,
    onError: (error) => toast.error(error.message),
  });

  const respond = useMutation({
    mutationFn: (answers: readonly { interactionId: string; optionId: string }[]) =>
      agent.respond([...answers]),
    onSettled: historyChanged,
    onError: (error) => toast.error(error.message),
  });

  const stop = useMutation({
    mutationFn: () => agent.cancel(),
    onSettled: historyChanged,
    onError: (error) => toast.error(error.message),
  });

  // The first message was typed on New chat, before this chat existed; send it once the session
  // is bound. Later messages go through the composer's handler.
  useMountEffect(() => {
    const text = takeFirstMessage(chatId);

    if (text) send.mutate(text);
  });

  const working = agent.status === "busy";

  // Something on screen already shows the agent at work: text streaming in, or a tool running.
  const visiblyWorking = agent.messages.some((message) =>
    message.parts.some(
      (part) =>
        ((part.type === "text" || part.type === "reasoning") && part.state === "streaming") ||
        (part.type === "tool" && shownCall(part) && stepState(part) === "pending"),
    ),
  );

  const answer = (interactionId: string, optionId: string) =>
    respond.mutate([{ interactionId, optionId }]);

  // Every call waiting on the person, in one card: approving ten is one click (as in comp-neo).
  const waiting = waitingApprovals(agent.messages);

  const approvalItems: ApprovalItem[] = waiting.map(({ part, interactionId }) => ({
    id: interactionId,
    label: stepLabel(part),
    detail: stepDetail(part),
  }));

  const decide = (ids: readonly string[], optionId: "approve" | "deny") =>
    respond.mutate(ids.map((interactionId) => ({ interactionId, optionId })));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {agent.messages.length === 0 && agent.status !== "resuming" && !firstMessage ? (
            <ConversationEmptyState
              title="What's on your mind?"
              description="Ask about a company, draft an email, or work through an idea."
            />
          ) : (
            agent.messages.map((message) => (
              <ChatMessage key={message.id} message={message} onAnswer={answer} />
            ))
          )}
          {working && !visiblyWorking && waiting.length === 0 && <ThinkingIndicator />}
          {agent.error && (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {agent.error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
        {approvalItems.length > 0 && (
          <ApprovalCard
            title={
              approvalItems.length === 1
                ? "The assistant wants to make a change"
                : `The assistant wants to make ${approvalItems.length} changes`
            }
            description="Approve to run them, or change the chat's mode so it asks less."
            items={approvalItems}
            disabled={respond.isPending}
            onApprove={(ids) => decide(ids, "approve")}
            onDeny={(ids) => decide(ids, "deny")}
          />
        )}
        <Composer
          focusOnMount
          status={working ? "streaming" : "ready"}
          disabled={agent.status === "resuming"}
          onSend={(text) => send.mutate(text)}
          onStop={() => stop.mutate()}
          tools={<PermissionModeMenu value={permissionMode} onChange={onPermissionModeChange} />}
        />
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onAnswer,
}: {
  message: EveMessage;
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {messageBlocks(message.parts).map((block) =>
          block.kind === "part" ? (
            <ChatPart key={block.key} part={block.part} onAnswer={onAnswer} />
          ) : (
            <ToolCalls key={block.key} calls={block.calls} onAnswer={onAnswer} />
          ),
        )}
      </MessageContent>
    </Message>
  );
}

function ChatPart({
  part,
  onAnswer,
}: {
  part: EveMessagePart;
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  switch (part.type) {
    case "text":
      return (
        <MessageResponse isAnimating={part.state === "streaming"}>{part.text}</MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool":
      return shownCall(part) ? <ToolCall part={part} onAnswer={onAnswer} /> : null;
    case "interaction":
      return <InteractionPrompt interaction={part} onAnswer={onAnswer} />;
    case "file":
      return (
        <span className="text-xs text-muted-foreground">{part.filename ?? part.mediaType}</span>
      );
    default:
      return null;
  }
}

/** One call as a step; a run of two or more calls to one tool as a group that opens. */
function ToolCalls({
  calls,
  onAnswer,
}: {
  calls: readonly ToolPart[];
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  const [first] = calls;

  if (!first) return null;

  if (calls.length === 1) return <ToolCall part={first} onAnswer={onAnswer} />;

  // A question the agent asks inside a call must be seen, so its group opens.
  const asking = calls.some(
    (call) => call.interaction?.status === "open" && call.interaction.request.kind !== "approval",
  );

  return (
    <ToolStepGroup
      label={stepLabel(first)}
      detail={runDetail(calls.map(stepDetail))}
      state={runState(calls.map(stepState))}
      defaultOpen={asking}
    >
      {calls.map((call) => (
        <ToolCall key={call.callId} part={call} onAnswer={onAnswer} />
      ))}
    </ToolStepGroup>
  );
}

function ToolCall({
  part,
  onAnswer,
}: {
  part: ToolPart;
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ToolStep
        label={stepLabel(part)}
        detail={stepDetail(part)}
        state={stepState(part)}
        error={part.error?.message}
      />
      {/* Approvals wait in one card above the composer; other questions stay with their call. */}
      {part.interaction?.status === "open" && part.interaction.request.kind !== "approval" && (
        <InteractionPrompt interaction={part.interaction} onAnswer={onAnswer} />
      )}
    </div>
  );
}

/** An approval, question or sign-in the agent waits on; settled ones show their outcome. */
function InteractionPrompt({
  interaction,
  onAnswer,
}: {
  interaction: Interaction | InteractionPart;
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  const { request } = interaction;

  if (interaction.status === "settled") {
    return (
      <p className="text-xs text-muted-foreground">
        {request.title ?? request.prompt}: {interaction.outcome ?? "settled"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 select-none">
      {request.title && <p className="text-sm font-medium text-balance">{request.title}</p>}
      <p className="text-sm text-pretty text-muted-foreground select-text">{request.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {request.options?.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={
              option.style === "danger"
                ? "destructive"
                : option.style === "primary"
                  ? "default"
                  : "outline"
            }
            onClick={() => onAnswer(interaction.interactionId, option.id)}
          >
            {option.label}
          </Button>
        ))}
        {request.link && (
          <Button
            size="sm"
            variant="outline"
            render={
              <a href={request.link.url} target="_blank" rel="noreferrer">
                {request.link.label ?? "Open"}
              </a>
            }
          >
            {request.link.label ?? "Open"}
          </Button>
        )}
      </div>
    </div>
  );
}
