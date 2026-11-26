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
  home: { code: "Digit0", alt: true },
} as const satisfies Record<string, Shortcut>;

/** ⌥1 to ⌥9 open the pinned pages, in the order the user arranged them. */
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
