/**
 * Keyboard shortcuts, bound with react-hotkeys-hook (see components/shell/shortcuts.tsx). They
 * match on `event.code`, so they work on any layout and with Option held (on macOS, ⌥1 types
 * "¡"). `mod` is ⌘ on Apple platforms and Ctrl elsewhere.
 */
export interface Shortcut {
  readonly code: string;
  readonly mod?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

export const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

export const shortcuts = {
  palette: { code: "KeyK", mod: true },
  sidebar: { code: "KeyB", mod: true },
  back: { code: "BracketLeft", mod: true },
  forward: { code: "BracketRight", mod: true },
  // New chat, the workspace home (ADR 0018).
  newChat: { code: "Digit0", alt: true },
  // Opens the create sheet from anywhere. ⌘C stays copy whenever there's something to copy:
  // see `claimsCopyShortcut`.
  create: { code: "KeyC", mod: true },
} as const satisfies Record<string, Shortcut>;

/** ⌥1 to ⌥9 open the first nine pinned pages, spaces and chats, in the order the user arranged. */
export function pinnedShortcut(index: number): Shortcut | undefined {
  return index < 9 ? { code: `Digit${index + 1}`, alt: true } : undefined;
}

/**
 * The shortcut in react-hotkeys-hook syntax ("mod+k", "alt+1", "mod+bracketleft"). The library
 * matches on `event.code` with "Key"/"Digit" stripped, so we spell the key the same way.
 */
export function toHotkey(shortcut: Shortcut) {
  return [
    ...(shortcut.mod ? ["mod"] : []),
    ...(shortcut.alt ? ["alt"] : []),
    ...(shortcut.shift ? ["shift"] : []),
    shortcut.code.toLowerCase().replace(/^(key|digit)/, ""),
  ].join("+");
}

const KEY_LABELS = new Map([
  ["BracketLeft", "["],
  ["BracketRight", "]"],
]);

/** Key caps for display, e.g. ["⌘", "K"] on a Mac and ["Ctrl", "K"] elsewhere. */
export function shortcutKeys(shortcut: Shortcut, apple = isApple()) {
  const key = KEY_LABELS.get(shortcut.code) ?? shortcut.code.replace(/^(Key|Digit)/, "");

  return [
    ...(shortcut.mod ? [apple ? "⌘" : "Ctrl"] : []),
    ...(shortcut.alt ? [apple ? "⌥" : "Alt"] : []),
    ...(shortcut.shift ? [apple ? "⇧" : "Shift"] : []),
    key,
  ];
}

/** The shortcut as an `aria-keyshortcuts` value, e.g. "Meta+K" or "Alt+1". */
export function ariaKeyShortcuts(shortcut: Shortcut, apple = isApple()) {
  const key = KEY_LABELS.get(shortcut.code) ?? shortcut.code.replace(/^(Key|Digit)/, "");

  return [
    ...(shortcut.mod ? [apple ? "Meta" : "Control"] : []),
    ...(shortcut.alt ? ["Alt"] : []),
    ...(shortcut.shift ? ["Shift"] : []),
    key,
  ].join("+");
}

/**
 * ⌘C creates only when it can't mean copy: no text is selected and focus isn't in a field.
 * With a selection it copies, as everywhere else on the Mac.
 */
/** What `claimsCopyShortcut` reads from a DOM `Selection`. */
export interface TextSelection {
  readonly isCollapsed: boolean;
  toString(): string;
}

/** What `claimsCopyShortcut` reads from the focused element (`document.activeElement`). */
export interface FocusedElement {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
}

export function claimsCopyShortcut(
  selection: TextSelection | null,
  focused: FocusedElement | null,
) {
  const editing =
    focused !== null &&
    (focused.isContentEditable === true ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName));

  return !editing && (selection === null || selection.isCollapsed || selection.toString() === "");
}
