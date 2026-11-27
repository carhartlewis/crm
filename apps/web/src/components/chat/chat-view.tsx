import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@crm/ui/components/ai-elements/conversation";
import copy from "@carbon/icons/es/copy/16.js";
import edit from "@carbon/icons/es/edit/16.js";
import fork from "@carbon/icons/es/fork/16.js";
import renew from "@carbon/icons/es/renew/16.js";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@crm/ui/components/ai-elements/message";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@crm/ui/components/ai-elements/reasoning";
import { ApprovalCard, type ApprovalItem } from "@crm/ui/patterns/approval-card";
import { QuestionCard, type QuestionOption } from "@crm/ui/patterns/question-card";
import { ThinkingIndicator } from "@crm/ui/patterns/dot-matrix";
import { ToolStep, ToolStepGroup } from "@crm/ui/patterns/tool-step";
import { Button } from "@crm/ui/components/button";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { chatAgentBase, type ChatHistory } from "@crm/core/api";
import type { EveMessage, EveMessagePart, SessionStreamEvent } from "eve/client";
import type { PermissionMode } from "@crm/core/chat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import { useHotkeys } from "react-hotkeys-hook";
import { useRef } from "react";
import { toast } from "sonner";
import { branchOf, chatKeys, followUpMode, takeFirstMessage } from "../../lib/chat-api.ts";
import { PermissionModeMenu } from "./permission-mode-menu.tsx";
import { ReplyResponse } from "./reply-islands.tsx";
import { Composer } from "./composer.tsx";

import {
  messageBlocks,
  runDetail,
  runState,
  shownCall,
  stepDetail,
  stepLabel,
  messageText,
  stepState,
  type ToolPart,
  transcriptUpTo,
  turnSummaries,
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
  /** Starts a new chat that continues this one up to a reply (its words as a transcript). */
  readonly onBranch?: (transcript: string) => void;
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
  onBranch,
}: ChatViewProps) {
  // The composer's text box, for Edit to put a message back.
  const field = useRef<HTMLTextAreaElement | null>(null);
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
    // While a turn runs, Jev decides whether the message redirects it or waits (see the API's
    // follow-up judge); the person never chooses.
    mutationFn: async ({ text }: { text: string }) => {
      const task = activeTurn(agent.view) === undefined ? null : lastRequest(agent.messages);
      const mode = task === null ? "steer" : await followUpMode(chatId, text, task);

      return agent.send(text, mode === "queue" ? { turnPolicy: "queue" } : undefined);
    },
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

    if (text) send.mutate({ text });
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

  const lastUser = agent.messages.findLast((message) => message.role === "user");
  const lastReply = agent.messages.findLast((message) => message.role === "assistant");

  /** Copy for every message; Retry and Edit on the latest ones while the agent is idle. */
  const messageActions = (message: EveMessage): MessageActionsSpec => {
    const text = messageText(message);
    const idle = !working;

    return {
      copy: text ? () => void copyText(text) : undefined,
      retry:
        idle && message.id === lastReply?.id && lastUser
          ? () => send.mutate({ text: messageText(lastUser) })
          : undefined,
      edit:
        idle && message.id === lastUser?.id && text
          ? () => {
              const box = field.current;

              if (!box) return;

              box.value = text;
              box.dispatchEvent(new Event("input", { bubbles: true }));
              box.focus();
              box.setSelectionRange(text.length, text.length);
            }
          : undefined,
      branch:
        onBranch && message.role === "assistant" && text
          ? () => onBranch(transcriptUpTo(agent.messages, message.id))
          : undefined,
    };
  };

  // "Worked for 14s · 5 steps" under each finished turn.
  const summaries = turnSummaries(agent.events, agent.messages);

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
              <ChatMessage
                key={message.id}
                message={message}
                summary={summaries.get(message.id)}
                onAnswer={answer}
                actions={messageActions(message)}
              />
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
          fieldRef={field}
          status={working ? "streaming" : "ready"}
          disabled={agent.status === "resuming"}
          onSend={(text) => send.mutate({ text })}
          onStop={() => stop.mutate()}
          tools={<PermissionModeMenu value={permissionMode} onChange={onPermissionModeChange} />}
        />
      </div>
    </div>
  );
}

const CopyIcon = carbonIcon(copy);
const EditIcon = carbonIcon(edit);
const BranchIcon = carbonIcon(fork);
const RetryIcon = carbonIcon(renew);

/** What a message's hover actions do; an absent one isn't shown. */
interface MessageActionsSpec {
  readonly copy: (() => void) | undefined;
  readonly retry: (() => void) | undefined;
  readonly edit: (() => void) | undefined;
  readonly branch: (() => void) | undefined;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy that");
  }
}

function ChatMessage({
  message,
  summary,
  onAnswer,
  actions,
}: {
  message: EveMessage;
  /** How long the finished turn took and how many steps it ran. */
  summary: string | undefined;
  onAnswer: (interactionId: string, optionId: string) => void;
  actions: MessageActionsSpec;
}) {
  const branchedFrom = message.role === "user" ? branchOf(messageText(message)) : null;
  const any = actions.copy ?? actions.retry ?? actions.edit ?? actions.branch;

  // A branch's first message holds the earlier conversation: it shows as one line.
  if (branchedFrom !== null) {
    return (
      <Message from="user">
        <MessageContent>
          <p className="text-sm text-muted-foreground">Continued from “{branchedFrom}”</p>
        </MessageContent>
      </Message>
    );
  }

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
      {summary && <p className="text-xs text-muted-foreground select-none">{summary}</p>}
      {any && (
        <MessageActions>
          {actions.copy && (
            <MessageAction tooltip="Copy" onClick={actions.copy}>
              <CopyIcon />
            </MessageAction>
          )}
          {actions.edit && (
            <MessageAction tooltip="Edit and resend" onClick={actions.edit}>
              <EditIcon />
            </MessageAction>
          )}
          {actions.retry && (
            <MessageAction tooltip="Retry" onClick={actions.retry}>
              <RetryIcon />
            </MessageAction>
          )}
          {actions.branch && (
            <MessageAction tooltip="New chat from here" onClick={actions.branch}>
              <BranchIcon />
            </MessageAction>
          )}
        </MessageActions>
      )}
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
      return <ReplyResponse text={part.text} streaming={part.state === "streaming"} />;
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

  // A question with choices (the agent's `ask_question`) is a card of answers, keys 1–9.
  if (request.kind === "question" && request.options && request.options.length > 0) {
    return (
      <QuestionPrompt
        question={request.prompt}
        title={request.title}
        options={request.options}
        onAnswer={(optionId) => onAnswer(interaction.interactionId, optionId)}
      />
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

/**
 * A question's answers, also on the number keys 1–9 (as in T3 Code), except while typing in a
 * field: the person can type their own answer in the composer instead.
 */
function QuestionPrompt({
  question,
  title,
  options,
  onAnswer,
}: {
  question: string;
  title: string | undefined;
  options: readonly QuestionOption[];
  onAnswer: (optionId: string) => void;
}) {
  useHotkeys(
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    (event) => {
      const option = options[Number(event.key) - 1];

      if (option) onAnswer(option.id);
    },
    { enableOnFormTags: false, preventDefault: true },
    [options, onAnswer],
  );

  return <QuestionCard question={question} title={title} options={options} onAnswer={onAnswer} />;
}

/** The person's latest message: the task a running turn is working on. */
function lastRequest(messages: readonly EveMessage[]) {
  const request = messages.findLast((message) => message.role === "user");

  return (
    request?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n") ?? ""
  );
}
