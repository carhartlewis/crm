"use client";

import { cn } from "cn";
import { createContext, use, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { DotMatrix } from "@crm/ui/patterns/dot-matrix";
import { Markdown } from "@crm/ui/components/markdown";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);

  if (!context) throw new Error("Reasoning components must be used within Reasoning");

  return context;
}

export type ReasoningProps = Omit<
  ComponentProps<typeof Collapsible>,
  "open" | "defaultOpen" | "onOpenChange"
> & {
  /** The agent is still thinking. */
  isStreaming?: boolean;
  open?: boolean;
  /**
   * Leave it out to open while the agent thinks and close when it stops. `false` keeps it closed
   * and `true` keeps it open until the member toggles it.
   */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seconds spent thinking, when the caller knows it. */
  duration?: number;
};

/**
 * The agent's thinking, folded away. Its open state is derived, not synced: it follows
 * `isStreaming` until the member opens or closes it, and from then on follows the member.
 */
function Reasoning({
  className,
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration,
  children,
  ...props
}: ReasoningProps) {
  const [chosen, setChosen] = useState<boolean | undefined>(defaultOpen);
  const isOpen = open ?? chosen ?? isStreaming;

  const context = useMemo(
    () => ({ duration, isOpen, isStreaming }),
    [duration, isOpen, isStreaming],
  );

  return (
    <ReasoningContext value={context}>
      <Collapsible
        data-slot="reasoning"
        className={cn("not-prose mb-4", className)}
        open={isOpen}
        onOpenChange={(next) => {
          setChosen(next);
          onOpenChange?.(next);
        }}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext>
  );
}

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

function defaultGetThinkingMessage(isStreaming: boolean, duration?: number) {
  if (isStreaming || duration === 0) return <span>Thinking</span>;

  if (duration === undefined) return <span>Thought for a few seconds</span>;

  return (
    <span>
      Thought for {duration} {duration === 1 ? "second" : "seconds"}
    </span>
  );
}

function ReasoningTrigger({
  className,
  children,
  getThinkingMessage = defaultGetThinkingMessage,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, duration } = useReasoning();

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {isStreaming && <DotMatrix decorative />}
          {getThinkingMessage(isStreaming, duration)}
        </>
      )}
    </CollapsibleTrigger>
  );
}

export type ReasoningContentProps = Omit<ComponentProps<typeof CollapsibleContent>, "children"> & {
  /** The thinking so far, as Markdown. */
  children: string;
};

function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  const { isStreaming } = useReasoning();

  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn("mt-4 text-sm text-muted-foreground outline-none", className)}
      {...props}
    >
      <Markdown isAnimating={isStreaming} className="text-muted-foreground">
        {children}
      </Markdown>
    </CollapsibleContent>
  );
}

export { Reasoning, ReasoningContent, ReasoningTrigger, useReasoning };
