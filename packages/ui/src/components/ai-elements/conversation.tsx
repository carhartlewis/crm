"use client";

import arrowDown16 from "@carbon/icons/es/arrow--down/16.js";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { useReducedMotion } from "./reduced-motion";

const ArrowDownIcon = carbonIcon(arrowDown16);

export type ConversationProps = ComponentProps<typeof StickToBottom>;

/**
 * The scrolling message log. It sticks to the bottom while new text streams in and lets go when
 * the reader scrolls up. It opens at the bottom at once; it follows growth smoothly, or at once
 * under reduced motion.
 */
function Conversation({ className, ...props }: ConversationProps) {
  const reduced = useReducedMotion();

  return (
    <StickToBottom
      data-slot="conversation"
      // Never sideways: long content wraps or truncates; the log scrolls only up and down.
      className={cn("relative flex-1 overflow-hidden", className)}
      initial="instant"
      resize={reduced ? "instant" : "smooth"}
      role="log"
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

function ConversationContent({ className, ...props }: ConversationContentProps) {
  return (
    <StickToBottom.Content
      data-slot="conversation-content"
      className={cn("flex flex-col gap-8 p-4", className)}
      {...props}
    />
  );
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

function ConversationEmptyState({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      data-slot="conversation-empty-state"
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 p-8 text-center select-none",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/** Shown only while the reader is scrolled up; jumps back to the newest message. */
function ConversationScrollButton({ className, onClick, ...props }: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const reduced = useReducedMotion();

  if (isAtBottom) return null;

  return (
    <Button
      data-slot="conversation-scroll-button"
      aria-label="Scroll to the newest message"
      className={cn("absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full", className)}
      onClick={(event) => {
        void scrollToBottom(reduced ? "instant" : "smooth");
        onClick?.(event);
      }}
      size="icon"
      type="button"
      // Filled, so it stands out over the conversation in both themes.
      variant="default"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}

export { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton };
