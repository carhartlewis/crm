"use client";

import { cn } from "cn";
import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { Button } from "@crm/ui/components/button";
import { Markdown, type ReactiveIslands } from "@crm/ui/components/markdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";

/** Who wrote a message. Matches the AI SDK's `UIMessage["role"]` without depending on it. */
export type MessageRole = "user" | "assistant" | "system";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole;
};

/** One turn in the log. The member's turns sit on the right in a bubble; the agent's run full width. */
function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-slot="message"
      data-from={from}
      className={cn(
        "group flex w-full flex-col gap-2",
        // The member's turns are a bubble on the right; the agent's span the column, as wide as
        // the composer below.
        from === "user" ? "is-user ml-auto max-w-[95%] justify-end" : "is-assistant",
        className,
      )}
      {...props}
    />
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/** The message body. Its text is CRM content, so it stays selectable. */
function MessageContent({ children, className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm text-pretty select-text",
        "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
        "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageActionsProps = ComponentProps<"div">;

function MessageActions({ className, children, ...props }: MessageActionsProps) {
  return (
    <div
      data-slot="message-actions"
      // Shown while the message has the pointer or focus, as in T3 Code; under the member's own
      // bubble they sit on the right.
      className={cn(
        "flex items-center gap-0.5 opacity-0 transition-opacity select-none group-hover:opacity-100 focus-within:opacity-100 group-[.is-user]:justify-end",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageActionProps = ComponentProps<typeof Button> & {
  /** Shown in a tooltip, and used as the accessible name when `label` is not set. */
  tooltip?: string;
  label?: string;
};

function MessageAction({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label ?? tooltip}</span>
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export type MessageResponseProps = {
  /** The full Markdown so far; pass the whole string on every update, not a delta. */
  children: string;
  /** `true` while the reply streams, `false` once it ends. Always pass it for a streamed reply. */
  isAnimating?: boolean;
  className?: string;
  /** Components the reply can embed (`Markdown`'s `islands`); a registry that never changes. */
  islands?: ReactiveIslands;
};

/**
 * The agent's reply as Markdown, through the shared `@pierre/words` renderer in streaming mode.
 * The renderer is ~130 kB of JS: load the chat that uses this lazily.
 */
const MessageResponse = memo(
  function MessageResponse({
    className,
    children,
    isAnimating = false,
    islands,
  }: MessageResponseProps) {
    return (
      <Markdown isAnimating={isAnimating} islands={islands} className={cn("size-full", className)}>
        {children}
      </Markdown>
    );
  },
  (previous, next) =>
    previous.children === next.children &&
    previous.isAnimating === next.isAnimating &&
    previous.className === next.className &&
    previous.islands === next.islands,
);

/** The older AI Elements name for `MessageResponse`. */
const Response = MessageResponse;

export type MessageToolbarProps = ComponentProps<"div">;

function MessageToolbar({ className, children, ...props }: MessageToolbarProps) {
  return (
    <div
      data-slot="message-toolbar"
      className={cn("mt-4 flex w-full items-center justify-between gap-4 select-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
  Response,
};
