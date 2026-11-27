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
import { ToolStep, ToolStepGroup, ToolStepResult } from "@crm/ui/patterns/tool-step";
import { Button } from "@crm/ui/components/button";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { chatAgentBase, type ChatHistory } from "@crm/core/api";
import type { EveMessage, EveMessagePart, SessionStreamEvent } from "eve/client";
import type { PermissionMode } from "@crm/core/chat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { activeTurn } from "eve/events";
import { useEveAgent } from "eve/react";
import { useHotkeys } from "react-hotkeys-hook";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChatMark } from "../brand.tsx";
import { branchOf, chatKeys, followUpMode, takeFirstMessage } from "../../lib/chat-api.ts";
import {
  type Attachment,
  messageContent,
  releasePreviews,
  uploadAttachment,
} from "../../lib/attachments.ts";
import { askToNotify, chatNotice, newQuestion, notifyChat } from "../../lib/chat-notify.ts";
import { PERMISSION_MODE_OPTIONS, RUN_PLAN_MODE } from "../../lib/permission-mode.ts";
import { type SlashCommand, skillCommandName, skillMessage } from "../../lib/slash-commands.ts";
import { useNavigate } from "@tanstack/react-router";
import { PermissionModeMenu } from "./permission-mode-menu.tsx";
import { MentionChip, ReplyResponse } from "./reply-islands.tsx";
import { ToolResultTable } from "./tool-results.tsx";
import {
  callUsage,
  listResult,
  peopleResult,
  withoutRepeatedTable,
} from "../../lib/tool-results.ts";
import { callUsageLabel, formatUsage, totalUsage } from "@crm/core/usage";
import { PeopleResults } from "./people-results.tsx";
import { callRecord, type TurnRecord, turnRecords } from "../../lib/turn-records.ts";
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

/** A question with choices (the agent's `ask_question`), which the person answers with a click. */
interface WaitingQuestion {
  readonly interactionId: string;
  readonly prompt: string;
  readonly title: string | undefined;
  readonly options: readonly QuestionOption[];
  readonly open: boolean;
}

const isChoiceQuestion = (interaction: Interaction | InteractionPart) =>
  interaction.request.kind === "question" && (interaction.request.options?.length ?? 0) > 0;

/**
 * The questions with choices in the latest reply, open or not, in the order asked: the agent may
 * ask a few at once (parallel `ask_question` calls), and the person answers them one by one.
 */
function latestQuestions(messages: readonly EveMessage[]): WaitingQuestion[] {
  const reply = messages.findLast((message) => message.role === "assistant");

  return (reply?.parts ?? []).flatMap((part) => {
    const interaction =
      part.type === "tool" ? part.interaction : part.type === "interaction" ? part : undefined;

    if (!interaction || !isChoiceQuestion(interaction)) return [];

    return [
      {
        interactionId: interaction.interactionId,
        prompt: interaction.request.prompt,
        title: interaction.request.title,
        options: interaction.request.options ?? [],
        open: interaction.status === "open",
      },
    ];
  });
}

export interface ChatViewProps {
  readonly chatId: string;
  readonly userId: string;
  /** The chat's title, for notifications while the window is in the background. */
  readonly title: string;
  /** The chat's permission mode, and how to change it (ADR 0019). */
  readonly permissionMode: string;
  readonly onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  readonly history: ChatHistory;
  /** Typed on New chat: sent once, as soon as the view mounts. */
  readonly firstMessage?: string;
  /** Starts a new chat that continues this one up to a reply (its words as a transcript). */
  readonly onBranch?: (transcript: string) => void;
  /** The workspace's enabled skills, offered as `/` commands. */
  readonly skills?: readonly ChatSkill[];
}

/** A workspace skill as the `/` menu offers it. */
export interface ChatSkill {
  readonly name: string;
  readonly description: string;
}

const NO_SKILLS: readonly ChatSkill[] = [];

/**
 * One chat: the saved events render at once, then the live stream follows from their cursor
 * through the agent proxy (ADR 0018). Remount it (`key`) for another chat.
 */
export function ChatView({
  chatId,
  userId,
  title,
  permissionMode,
  onPermissionModeChange,
  history,
  firstMessage,
  onBranch,
  skills = NO_SKILLS,
}: ChatViewProps) {
  // The composer's text box, for Edit to put a message back.
  const field = useRef<HTMLTextAreaElement | null>(null);
  const queryClient = useQueryClient();
  // Questions asked before this moment were seen when the chat was last open.
  const [openedAt] = useState(Date.now);

  // The saved history is behind once the chat moves on; the next visit reads it again.
  const historyChanged = () =>
    queryClient.invalidateQueries({ queryKey: chatKeys.history(userId, chatId) });

  const agent = useEveAgent({
    baseUrl: chatAgentBase(chatId),
    // SAFETY: the API passes eve's stream events through unchanged (`ChatHistory.events`).
    initialEvents: history.events as readonly SessionStreamEvent[],
    initialSession: history.session,
    resume: true,
    // While the window is in the background, a finished reply or a question shows as a
    // notification (as in T3 Code); catching up on the chat never does.
    onFinish: (snapshot) => {
      const reply = snapshot.messages.findLast((message) => message.role === "assistant");

      notifyChat(chatNotice("finished", title, reply ? messageText(reply) : ""));
    },
    onEvent: (event) => {
      const question = newQuestion(event, openedAt);

      if (question !== null) notifyChat(chatNotice("input", title, question));
    },
  });

  // Attached files upload first (up to 30 MB each), then the message carries their URLs.
  const uploadFiles = async (files: readonly Attachment[]) => {
    if (files.length === 0) return [];

    const progress = toast.loading(
      files.length === 1 ? "Uploading the file" : `Uploading ${files.length} files`,
    );

    try {
      return await Promise.all(files.map((file) => uploadAttachment(chatId, file)));
    } finally {
      toast.dismiss(progress);
      releasePreviews(files);
    }
  };

  // Sends, answers and stops resolve when the server accepts them; a refusal (such as a session
  // the agent can no longer run) shows as a toast, and the optimistic message stays marked failed.
  const send = useMutation({
    // While a turn runs, Jev decides whether the message redirects it or waits (see the API's
    // follow-up judge); the person never chooses.
    mutationFn: async ({ text, files = [] }: { text: string; files?: readonly Attachment[] }) => {
      askToNotify();

      const sent = await uploadFiles(files);
      const task = activeTurn(agent.view) === undefined ? null : lastRequest(agent.messages);
      const mode = task === null || !text ? "steer" : await followUpMode(chatId, text, task);

      return agent.send(
        messageContent(text, sent),
        mode === "queue" ? { turnPolicy: "queue" } : undefined,
      );
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
    const first = takeFirstMessage(chatId);

    if (first) send.mutate(first);
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

  // "Worked for 14s · 5 steps · $0.31" under each finished turn.
  const summaries = turnSummaries(agent.events, agent.messages);

  // What the chat's paid lookups cost so far (ADR 0027).
  const chatCost = totalUsage(
    agent.messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const usage = part.type === "tool" ? callUsage(part) : null;

        return usage ? [usage] : [];
      }),
    ),
  );

  const answer = (interactionId: string, optionId: string) =>
    respond.mutate([{ interactionId, optionId }]);

  // Questions wait in one card above the composer, one at a time: "Question 2 of 3". An answer
  // just sent counts as answered until eve settles it.
  const sent = respond.isError ? [] : (respond.variables ?? []).map((item) => item.interactionId);
  const questions = latestQuestions(agent.messages);

  const pending = questions.filter(
    (question) => question.open && !sent.includes(question.interactionId),
  );

  const [question] = pending;
  const questionNumber = questions.length - pending.length + 1;

  const navigate = useNavigate();

  const compact = useMutation({
    mutationFn: () => agent.compact(),
    onSuccess: () => toast.success("Compacted the conversation"),
    onSettled: historyChanged,
    onError: (error) => toast.error(error.message),
  });

  const clear = useMutation({
    mutationFn: () => agent.clear(),
    onSuccess: () => toast.success("The assistant starts fresh from here"),
    onSettled: historyChanged,
    onError: (error) => toast.error(error.message),
  });

  // `/plan add Mercury` switches the mode, then sends the rest.
  const switchMode = async (mode: PermissionMode, rest: string) => {
    try {
      await onPermissionModeChange(mode);
    } catch {
      return;
    }

    if (rest) send.mutate({ text: rest });
  };

  const commands: SlashCommand[] = [
    ...PERMISSION_MODE_OPTIONS.map((option) => ({
      name: option.value,
      description: option.description,
      run: (rest: string) => void switchMode(option.value, rest),
    })),
    {
      name: "compact",
      description: "Summarize the conversation so far to make room",
      run: () => compact.mutate(),
    },
    {
      name: "clear",
      description: "Start fresh: the assistant forgets this chat, the messages stay",
      run: () => clear.mutate(),
    },
    { name: "new", description: "Start a new chat", run: () => void navigate({ to: "/" }) },
    ...skills.map((skill) => ({
      name: skillCommandName(skill.name),
      description: skill.description,
      takesText: true,
      run: (rest: string) => send.mutate({ text: skillMessage(skill.name, rest) }),
    })),
  ];

  // In Plan, a finished reply ends with the plan; running it switches the chat to Auto first, so
  // the API forwards the new mode with the message that starts the work.
  const runPlan = useMutation({
    mutationFn: async () => {
      await onPermissionModeChange(RUN_PLAN_MODE);
      await send.mutateAsync({ text: "Run the plan." });
    },
  });

  const planReady =
    permissionMode === "plan" &&
    !working &&
    agent.messages.at(-1)?.role === "assistant" &&
    lastReply !== undefined &&
    messageText(lastReply) !== "";

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
          {agent.messages.length === 0 &&
          agent.status !== "resuming" &&
          firstMessage === undefined ? (
            <ConversationEmptyState
              icon={<ChatMark />}
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
                onAsk={(text) => send.mutate({ text })}
                actions={messageActions(message)}
              />
            ))
          )}
          {working && !visiblyWorking && waiting.length === 0 && !question && <ThinkingIndicator />}
          {chatCost > 0 && !working ? (
            <p className="text-xs text-muted-foreground tabular-nums select-none">
              Lookups in this chat · {formatUsage(chatCost)}
            </p>
          ) : null}
          {agent.error && (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {agent.error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
        {planReady && !question && (
          <div className="flex justify-end">
            <Button size="sm" loading={runPlan.isPending} onClick={() => runPlan.mutate()}>
              Run plan
            </Button>
          </div>
        )}
        {question && (
          <QuestionPrompt
            key={question.interactionId}
            question={question.prompt}
            title={
              questions.length > 1
                ? `Question ${questionNumber} of ${questions.length}`
                : question.title
            }
            options={question.options}
            onAnswer={(optionId) => answer(question.interactionId, optionId)}
          />
        )}
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
          onSend={(text, files) => send.mutate({ text, files })}
          commands={commands}
          onStop={() => stop.mutate()}
          tools={
            <PermissionModeMenu
              value={permissionMode}
              onChange={(mode) => void onPermissionModeChange(mode).catch(() => undefined)}
            />
          }
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
  onAsk,
  actions,
}: {
  message: EveMessage;
  /** How long the finished turn took, how many steps it ran and what they cost. */
  summary: string | undefined;
  onAnswer: (interactionId: string, optionId: string) => void;
  /** Sends a follow-up message, as a result table's actions do. */
  onAsk: (text: string) => void;
  actions: MessageActionsSpec;
}) {
  const branchedFrom = message.role === "user" ? branchOf(messageText(message)) : null;
  const any = actions.copy ?? actions.retry ?? actions.edit ?? actions.branch;
  const blocks = messageBlocks(message.parts);

  // The records this message's calls touched: the reply's names for them open them.
  const touched = turnRecords(
    message.parts.flatMap((part) => (part.type === "tool" ? [part] : [])),
  );

  // Only the turn's latest call keeps its result open: a table an earlier call showed is out
  // of date once another call runs, so it folds into its step, which opens it again.
  const lastCalls = blocks.findLast((block) => block.kind === "calls");
  const latestCallId = lastCalls?.kind === "calls" ? lastCalls.calls.at(-1)?.callId : undefined;

  // A list shown open as a result table: the reply's own copy of it, after that call, is dropped.
  const tableAt = blocks.findIndex(
    (block) =>
      block.kind === "calls" &&
      block.calls.some(
        (call) =>
          call.callId === latestCallId &&
          (listResult(call) !== null || peopleResult(call) !== null),
      ),
  );

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
        {blocks.map((block, index) => {
          if (block.kind === "calls") {
            return (
              <ToolCalls
                key={block.key}
                calls={block.calls}
                latestCallId={latestCallId}
                onAnswer={onAnswer}
                onAsk={onAsk}
              />
            );
          }

          const part =
            tableAt !== -1 && index > tableAt && block.part.type === "text"
              ? { ...block.part, text: withoutRepeatedTable(block.part.text) }
              : block.part;

          return (
            <ChatPart
              key={block.key}
              part={part}
              touched={touched}
              onAnswer={onAnswer}
              onAsk={onAsk}
            />
          );
        })}
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
  touched,
  onAnswer,
  onAsk,
}: {
  part: EveMessagePart;
  touched: readonly TurnRecord[];
  onAnswer: (interactionId: string, optionId: string) => void;
  onAsk: (text: string) => void;
}) {
  switch (part.type) {
    case "text":
      return (
        <ReplyResponse text={part.text} streaming={part.state === "streaming"} touched={touched} />
      );
    case "reasoning":
      return (
        // Closed while the agent thinks too: the row shimmers "Thinking", and the thinking itself
        // (long with GLM) opens only on a click.
        <Reasoning isStreaming={part.state === "streaming"} defaultOpen={false}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool":
      return shownCall(part) ? <ToolCall part={part} onAnswer={onAnswer} onAsk={onAsk} /> : null;
    case "interaction":
      return <InteractionPrompt interaction={part} onAnswer={onAnswer} />;
    case "file":
      return <MessageFile url={part.url} mediaType={part.mediaType} filename={part.filename} />;
    default:
      return null;
  }
}

/**
 * A file sent with a message: an image as a preview, anything else as a tile that opens it. A
 * file eve kept no URL for (sent before files were stored) shows its name only.
 */
function MessageFile({
  url,
  mediaType,
  filename,
}: {
  url: string | undefined;
  mediaType: string;
  filename: string | undefined;
}) {
  const name = filename ?? mediaType;

  if (url && mediaType.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="max-h-60 max-w-full rounded-md border object-contain"
        />
      </a>
    );
  }

  const tile = (
    <span className="flex max-w-72 min-w-0 flex-col gap-0.5 rounded-md border bg-background px-3 py-2 select-none">
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
      <span className="text-xs text-muted-foreground">{fileKind(name)}</span>
    </span>
  );

  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
      {tile}
    </a>
  ) : (
    tile
  );
}

/** "PDF", "XLSX": what a file is, from its name. */
const fileKind = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toUpperCase() ?? "File";

/** One call as a step; a run of two or more calls to one tool as a group that opens. */
function ToolCalls({
  calls,
  latestCallId,
  onAnswer,
  onAsk,
}: {
  calls: readonly ToolPart[];
  /** The message's last call: only its result shows open. */
  latestCallId: string | undefined;
  onAnswer: (interactionId: string, optionId: string) => void;
  onAsk: (text: string) => void;
}) {
  const [first] = calls;

  if (!first) return null;

  if (calls.length === 1) {
    return (
      <ToolCall
        part={first}
        latest={first.callId === latestCallId}
        onAnswer={onAnswer}
        onAsk={onAsk}
      />
    );
  }

  // What the run cost together, when any call in it was paid (ADR 0027).
  const usages = calls.flatMap((call) => {
    const usage = callUsage(call);

    return usage ? [usage] : [];
  });

  // A sign-in or open question asked inside a call must be seen, so its group opens.
  const asking = calls.some(
    (call) =>
      call.interaction?.status === "open" &&
      call.interaction.request.kind !== "approval" &&
      !isChoiceQuestion(call.interaction),
  );

  return (
    <ToolStepGroup
      label={stepLabel(first)}
      detail={runDetail(calls.map(stepDetail))}
      cost={usages.length > 0 ? formatUsage(totalUsage(usages)) : undefined}
      state={runState(calls.map(stepState))}
      defaultOpen={asking}
    >
      {calls.map((call) => (
        <ToolCall
          key={call.callId}
          part={call}
          latest={call.callId === latestCallId}
          onAnswer={onAnswer}
          onAsk={onAsk}
        />
      ))}
    </ToolStepGroup>
  );
}

function ToolCall({
  part,
  latest = true,
  onAnswer,
  onAsk,
}: {
  part: ToolPart;
  /** The turn's latest call: its result starts open. */
  latest?: boolean;
  onAnswer: (interactionId: string, optionId: string) => void;
  onAsk: (text: string) => void;
}) {
  // CRM list calls show their rows as a table (ADR 0024); a people search shows its people.
  const result = listResult(part);
  const people = peopleResult(part);
  // A paid call's price at the end of its line (ADR 0027).
  const usage = callUsage(part);
  const cost = usage ? callUsageLabel(usage) : undefined;
  // A record the call wrote or read shows as its name, from the call's answer, not the reply.
  // The name opens the record, but its logo shows only in the reply, the turn's latest view, so
  // one record doesn't show the same chip on every step and again in the answer.
  const record = callRecord(part);

  const detail = record ? (
    <MentionChip
      fallback={stepDetail(part)}
      id={record.id}
      kind={record.kind}
      label={record.name}
      mark={false}
    />
  ) : (
    stepDetail(part)
  );

  return (
    <div className="flex flex-col gap-2">
      {result || people ? (
        // Keyed on `latest`, so the table folds away when a later call runs.
        <ToolStepResult
          key={String(latest)}
          label={stepLabel(part)}
          detail={detail}
          cost={cost}
          state={stepState(part)}
          defaultOpen={latest}
        >
          {people ? (
            <PeopleResults rows={people} onAsk={onAsk} />
          ) : result ? (
            <ToolResultTable result={result} />
          ) : null}
        </ToolStepResult>
      ) : (
        <ToolStep label={stepLabel(part)} detail={detail} cost={cost} state={stepState(part)} />
      )}
      {/* Approvals and questions with choices wait above the composer; sign-ins and open
          questions stay with their call. */}
      {part.interaction?.status === "open" &&
        part.interaction.request.kind !== "approval" &&
        !isChoiceQuestion(part.interaction) && (
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

  // A question with choices waits in the card above the composer.
  if (isChoiceQuestion(interaction)) return null;

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
