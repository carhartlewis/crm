import {
  type ChatStatus,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@crm/ui/components/ai-elements/prompt-input";
import { type KeyboardEvent, type ReactNode, useState } from "react";

export interface ComposerProps {
  readonly onSend: (text: string) => void;
  /** Stops the agent's turn; the submit button becomes Stop while it works. */
  readonly onStop?: () => void;
  readonly status?: ChatStatus;
  readonly disabled?: boolean;
  /** Above the text, such as the space picker on New chat. */
  readonly header?: ReactNode;
  /** Puts the caret in the composer when it appears: chat is keyboard-first. */
  readonly focusOnMount?: boolean;
  /** Controls beside Send, such as the permission mode. */
  readonly tools?: ReactNode;
  /** Runs once when the person starts typing, such as prewarming a session. */
  readonly onTypingStart?: () => void;
}

/**
 * Focuses the field once, as it mounts, without scrolling the page: you open a chat to type, as
 * in desktop chat apps. Not on touch screens, where focus raises the keyboard over the chat.
 */
function focusField(field: HTMLTextAreaElement | null) {
  if (field && matchMedia("(pointer: fine)").matches) field.focus({ preventScroll: true });
}

/**
 * The chat composer: AI Elements' prompt input in the border beam. Enter sends, also while the
 * agent works (the chat decides whether that redirects the reply or waits for it), and Escape
 * stops the turn. The button is Stop while the box is empty and Send once there's text.
 */
export function Composer({
  onSend,
  onStop,
  status = "ready",
  disabled = false,
  header,
  focusOnMount = false,
  tools,
  onTypingStart,
}: ComposerProps) {
  const working = status === "streaming" || status === "submitted";
  const [hasText, setHasText] = useState(false);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && working && onStop) {
      event.preventDefault();
      onStop();
    }
  };

  return (
    <PromptInput
      // The beam runs always on the chat composer, focused or not.
      beam
      onSubmit={({ text }) => {
        setHasText(false);

        if (text.trim()) onSend(text.trim());
      }}
    >
      {header && <PromptInputHeader>{header}</PromptInputHeader>}
      <PromptInputBody>
        <PromptInputTextarea
          name="message"
          placeholder={working ? "Add to this, or ask something else" : "Work on anything"}
          aria-label="Message"
          ref={focusOnMount ? focusField : undefined}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onInput={(event) => {
            setHasText(event.currentTarget.value.trim() !== "");
            onTypingStart?.();
          }}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <div className="flex items-center gap-1">
          {tools}
          <PromptInputSubmit
            // With text in the box, the button sends (and redirects); empty, it stops.
            status={working && !hasText ? status : "ready"}
            onStop={onStop}
            disabled={disabled}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
