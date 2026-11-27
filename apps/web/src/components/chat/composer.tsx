import attachment from "@carbon/icons/es/attachment/16.js";
import {
  type ChatStatus,
  PromptInput,
  PromptInputBody,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputCommands,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@crm/ui/components/ai-elements/prompt-input";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  type Attachment,
  checkFiles,
  FILE_ACCEPT,
  releasePreviews,
  toAttachment,
} from "../../lib/attachments.ts";

import {
  commandFor,
  matchCommands,
  type SlashCommand,
  slashQuery,
} from "../../lib/slash-commands.ts";

const AttachIcon = carbonIcon(attachment);

const NO_COMMANDS: readonly SlashCommand[] = [];

export interface ComposerProps {
  /** The message: its text (trimmed) and any files the person attached. */
  readonly onSend: (text: string, files: readonly Attachment[]) => void;
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
  /** The text field, for putting a message back to edit. */
  readonly fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** What `/` offers. A sent message that names one runs it instead of sending. */
  readonly commands?: readonly SlashCommand[];
  /** The empty field's hint while the agent is idle. */
  readonly placeholder?: string;
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
 * stops the turn. The button is Stop while the box is empty and Send once there's text. Files
 * come in by paste, drop or the attach button and upload when the message is sent.
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
  fieldRef,
  commands = NO_COMMANDS,
  placeholder = "Work on anything",
}: ComposerProps) {
  const field = useRef<HTMLTextAreaElement | null>(null);

  const setField = useCallback(
    (element: HTMLTextAreaElement | null) => {
      field.current = element;

      if (fieldRef) fieldRef.current = element;

      if (focusOnMount) focusField(element);
    },
    [fieldRef, focusOnMount],
  );

  const working = status === "streaming" || status === "submitted";
  const [hasText, setHasText] = useState(false);
  const [files, setFiles] = useState<readonly Attachment[]>([]);
  const picker = useRef<HTMLInputElement>(null);

  // The `/` menu: open while only `/name` is typed, until Escape or a pick.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches = query === null ? [] : matchCommands(query, commands);
  const menuOpen = matches.length > 0;

  const setText = (text: string) => {
    const box = field.current;

    if (!box) return;

    box.value = text;
    setHasText(text.trim() !== "");
    setQuery(null);
    box.focus();
    box.setSelectionRange(text.length, text.length);
  };

  const pick = (command: SlashCommand | undefined) => {
    if (!command) return;

    // A skill waits for what it should work on; the rest run now.
    if (command.takesText) {
      setText(`/${command.name} `);

      return;
    }

    setText("");
    command.run("");
  };

  const attach = (picked: readonly File[]) => {
    const { accepted, refused } = checkFiles(picked, files.length);

    if (refused.length > 0) toast.error(refused.join(". "));

    if (accepted.length > 0) setFiles((held) => [...held, ...accepted.map(toAttachment)]);
  };

  // A pasted screenshot is attached; pasted text goes in the box as usual.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = [...event.clipboardData.files];

    if (pasted.length === 0) return;

    event.preventDefault();
    attach(pasted);
  };

  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    const dropped = [...event.dataTransfer.files];

    if (dropped.length === 0) return;

    event.preventDefault();
    attach(dropped);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && !event.nativeEvent.isComposing) {
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];

      if (step !== undefined) {
        event.preventDefault();
        setActive((active + step + matches.length) % matches.length);

        return;
      }

      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        pick(matches[Math.min(active, matches.length - 1)]);

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);

        return;
      }
    }

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
        const message = text.trim();

        if (!message && files.length === 0) return;

        setHasText(false);
        setQuery(null);

        const typed = commandFor(message, commands);

        if (typed) {
          typed.command.run(typed.rest);

          return;
        }

        setFiles([]);
        onSend(message, files);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      {header && <PromptInputHeader>{header}</PromptInputHeader>}
      <PromptInputCommands
        commands={matches}
        active={Math.min(active, matches.length - 1)}
        onActive={setActive}
        onPick={(index) => pick(matches[index])}
      />
      <PromptInputAttachments
        attachments={files.map((file) => ({
          id: file.id,
          name: file.filename,
          src: file.previewUrl,
        }))}
        onRemove={(id) => {
          releasePreviews(files.filter((file) => file.id === id));
          setFiles((held) => held.filter((file) => file.id !== id));
        }}
      />
      <PromptInputBody>
        <PromptInputTextarea
          name="message"
          placeholder={working ? "Add to this, or ask something else" : placeholder}
          aria-label="Message"
          aria-expanded={menuOpen}
          aria-autocomplete="list"
          ref={setField}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onInput={(event) => {
            const { value } = event.currentTarget;
            const next = slashQuery(value);

            setHasText(value.trim() !== "");

            if (next !== query) setActive(0);

            setQuery(next);
            onTypingStart?.();
          }}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputButton
            tooltip="Attach files"
            aria-label="Attach files"
            disabled={disabled}
            onClick={() => picker.current?.click()}
          >
            <AttachIcon />
          </PromptInputButton>
          <input
            ref={picker}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              attach([...(event.currentTarget.files ?? [])]);
              event.currentTarget.value = "";
            }}
          />
        </PromptInputTools>
        <div className="flex items-center gap-1">
          {tools}
          <PromptInputSubmit
            // With text in the box, the button sends (and redirects); empty, it stops.
            status={working && !hasText && files.length === 0 ? status : "ready"}
            onStop={onStop}
            disabled={disabled}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
