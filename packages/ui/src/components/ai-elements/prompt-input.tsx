"use client";

import arrowUp16 from "@carbon/icons/es/arrow--up/16.js";
import close16 from "@carbon/icons/es/close/16.js";
import stopFilled16 from "@carbon/icons/es/stop--filled/16.js";
import { cn } from "cn";
import {
  Children,
  useState,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { BorderBeam } from "@crm/ui/components/border-beam";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@crm/ui/components/input-group";
import { Kbd, KbdGroup } from "@crm/ui/components/kbd";
import { Spinner } from "@crm/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";

const ArrowUpIcon = carbonIcon(arrowUp16);
const CloseIcon = carbonIcon(close16);
const StopIcon = carbonIcon(stopFilled16);

/** Where a chat turn is. The same values as the AI SDK's `ChatStatus`, without depending on it. */
export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

export interface PromptInputMessage {
  text: string;
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  /**
   * Called with the composer's text. An uncontrolled textarea is cleared at once; a controlled one
   * (`value` on `PromptInputTextarea`) is the caller's to clear. Run the send through a mutation.
   */
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void;
  /** Keep the border beam running, as while the agent replies. It always runs while the composer has focus. */
  beam?: boolean;
};

/**
 * The chat composer: a form around an input group, wrapped in the house `BorderBeam`. The beam runs
 * while the composer has focus (or `beam` is set), so it stays calm at rest. Enter sends and
 * Shift+Enter adds a line (see `PromptInputTextarea`).
 */
function PromptInput({ className, onSubmit, beam = false, children, ...props }: PromptInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <form
      data-slot="prompt-input"
      className={cn("w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();

        const form = event.currentTarget;
        const field = form.elements.namedItem("message");
        const text = field instanceof HTMLTextAreaElement ? field.value : "";

        // Clear before the caller runs, so text typed while the send is in flight is kept.
        form.reset();
        onSubmit({ text }, event);
      }}
      {...props}
    >
      <BorderBeam
        active={beam || focused}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <InputGroup className="overflow-hidden rounded-xl bg-background">{children}</InputGroup>
      </BorderBeam>
    </form>
  );
}

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div data-slot="prompt-input-body" className={cn("contents", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

/** Enter sends (unless the submit button is disabled or an IME is composing); Shift+Enter adds a line. */
function PromptInputTextarea({
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);

    if (event.defaultPrevented) return;

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();

    const { form } = event.currentTarget;
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (submit?.disabled) return;

    form?.requestSubmit();
  }

  return (
    <InputGroupTextarea
      data-slot="prompt-input-textarea"
      className={cn("field-sizing-content max-h-48 min-h-16 select-text", className)}
      name="message"
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
}

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

function PromptInputHeader({ className, ...props }: PromptInputHeaderProps) {
  return (
    <InputGroupAddon
      data-slot="prompt-input-header"
      align="block-end"
      className={cn("order-first flex-wrap gap-1", className)}
      {...props}
    />
  );
}

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

/** The row under the textarea: tools on the left, submit on the right. */
function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      data-slot="prompt-input-footer"
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  );
}

/** The older AI Elements name for `PromptInputFooter`. */
const PromptInputToolbar = PromptInputFooter;

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn("flex min-w-0 items-center gap-1", className)}
      {...props}
    />
  );
}

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  /** The control's name, shown in a tooltip. */
  tooltip?: ReactNode;
  /** Key caps for the control's hotkey, such as `["⌘", "K"]`. Hints live in the tooltip, never in the label. */
  tooltipKeys?: readonly string[];
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
};

function PromptInputButton({
  variant = "ghost",
  className,
  size,
  tooltip,
  tooltipKeys,
  tooltipSide = "top",
  ...props
}: PromptInputButtonProps) {
  const button = (
    <InputGroupButton
      className={className}
      size={size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm")}
      type="button"
      variant={variant}
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={tooltipSide}>
        {tooltip}
        {tooltipKeys && tooltipKeys.length > 0 && (
          <KbdGroup>
            {tooltipKeys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  /** Called instead of submitting while the turn is in flight. */
  onStop?: () => void;
};

/**
 * Sends the message; while a turn is in flight it becomes Stop (when `onStop` is given). The icon
 * swaps without animation: the action is often keyboard-initiated (Enter).
 */
function PromptInputSubmit({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming";
  const stops = isGenerating && onStop !== undefined;
  let icon = <ArrowUpIcon className="size-4" />;

  if (status === "submitted") icon = <Spinner />;
  else if (status === "streaming") icon = <StopIcon className="size-4" />;
  else if (status === "error") icon = <CloseIcon className="size-4" />;

  return (
    <InputGroupButton
      data-slot="prompt-input-submit"
      aria-label={stops ? "Stop" : "Send"}
      aria-busy={status === "submitted" || undefined}
      className={className}
      onClick={(event) => {
        if (isGenerating && onStop) {
          event.preventDefault();
          onStop();

          return;
        }

        onClick?.(event);
      }}
      size={size}
      type={stops ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  );
}

export {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
};
