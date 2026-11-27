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
import type { ReactNode } from "react";

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
  /** Runs once when the person starts typing, such as prewarming a session. */
  readonly onTypingStart?: () => void;
}

/** Focuses the field once, as it mounts, without scrolling the page. */
function focusField(field: HTMLTextAreaElement | null) {
  field?.focus({ preventScroll: true });
}

/** The chat composer: AI Elements' prompt input in the border beam. Enter sends. */
export function Composer({
  onSend,
  onStop,
  status = "ready",
  disabled = false,
  header,
  focusOnMount = false,
  onTypingStart,
}: ComposerProps) {
  return (
    <PromptInput
      // The beam runs always on the chat composer, focused or not.
      beam
      onSubmit={({ text }) => {
        if (text.trim()) onSend(text.trim());
      }}
    >
      {header && <PromptInputHeader>{header}</PromptInputHeader>}
      <PromptInputBody>
        <PromptInputTextarea
          name="message"
          placeholder="Work on anything"
          aria-label="Message"
          ref={focusOnMount ? focusField : undefined}
          disabled={disabled}
          onInput={onTypingStart}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit status={status} onStop={onStop} disabled={disabled} />
      </PromptInputFooter>
    </PromptInput>
  );
}
