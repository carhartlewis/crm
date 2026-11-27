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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@crm/ui/components/ai-elements/tool";
import { Button } from "@crm/ui/components/button";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { chatAgentBase, type ChatHistory } from "@crm/core/api";
import type { EveMessage, EveMessagePart, SessionStreamEvent } from "eve/client";
import { useMutation } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { toast } from "sonner";
import { takeFirstMessage } from "../../lib/chat-api.ts";
import { Composer } from "./composer.tsx";

type ToolPart = Extract<EveMessagePart, { type: "tool" }>;

type InteractionPart = Extract<EveMessagePart, { type: "interaction" }>;

type Interaction = NonNullable<ToolPart["interaction"]>;

/** eve's call states as AI Elements' tool states. */
function toolState(part: ToolPart): ToolState {
  switch (part.state) {
    case "streaming":
      return "input-streaming";
    case "approval":
      return "approval-requested";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    case "rejected":
    case "cancelled":
      return "output-denied";
    default:
      return "input-available";
  }
}

export interface ChatViewProps {
  readonly chatId: string;
  readonly history: ChatHistory;
  /** Typed on New chat: sent once, as soon as the view mounts. */
  readonly firstMessage?: string;
}

/**
 * One chat: the saved events render at once, then the live stream follows from their cursor
 * through the agent proxy (ADR 0018). Remount it (`key`) for another chat.
 */
export function ChatView({ chatId, history, firstMessage }: ChatViewProps) {
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
    onError: (error) => toast.error(error.message),
  });

  const respond = useMutation({
    mutationFn: (answer: { interactionId: string; optionId: string }) => agent.respond([answer]),
    onError: (error) => toast.error(error.message),
  });

  const stop = useMutation({
    mutationFn: () => agent.cancel(),
    onError: (error) => toast.error(error.message),
  });

  // The first message was typed on New chat, before this chat existed; send it once the session
  // is bound. Later messages go through the composer's handler.
  useMountEffect(() => {
    const text = takeFirstMessage(chatId);

    if (text) send.mutate(text);
  });

  const working = agent.status === "busy";

  const answer = (interactionId: string, optionId: string) =>
    respond.mutate({ interactionId, optionId });

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
          {agent.error && (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {agent.error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer
          focusOnMount
          status={working ? "streaming" : "ready"}
          disabled={agent.status === "resuming"}
          onSend={(text) => send.mutate(text)}
          onStop={() => stop.mutate()}
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
        {message.parts.map((part, index) => (
          // Text and reasoning parts carry stable ids; the rest keep their place in the turn.
          <ChatPart key={partKey(part, index)} part={part} onAnswer={onAnswer} />
        ))}
      </MessageContent>
    </Message>
  );
}

function partKey(part: EveMessagePart, index: number) {
  if (part.type === "tool") return part.callId;

  if (part.type === "interaction") return part.interactionId;

  if ((part.type === "text" || part.type === "reasoning") && part.id) return part.id;

  return `${part.type}-${index}`;
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
      return part.hidden ? null : <ToolCall part={part} onAnswer={onAnswer} />;
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

function ToolCall({
  part,
  onAnswer,
}: {
  part: ToolPart;
  onAnswer: (interactionId: string, optionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Tool>
        <ToolHeader title={part.label} toolName={part.name} state={toolState(part)} />
        <ToolContent>
          {part.state !== "streaming" && <ToolInput input={part.input} />}
          {(part.output !== undefined || part.error) && (
            <ToolOutput output={part.output} errorText={part.error?.message} />
          )}
        </ToolContent>
      </Tool>
      {part.interaction?.status === "open" && (
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
