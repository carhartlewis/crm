import { isApple } from "./shortcuts.ts";

/** What `formToSubmit` reads from a keydown. */
export interface SubmitKey {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
}

/** What `formToSubmit` reads from the focused element: the form it sits in, if any. */
export interface InForm<F> {
  closest(selector: "form"): F | null;
}

/**
 * ⌘Enter (Ctrl+Enter off Apple platforms) submits the form that has focus, everywhere: sheets,
 * dialogs, settings, sign-in. A held key submits once; text still being composed (IME) is left
 * alone. Returns the form to submit, or null.
 */
export function formToSubmit<F>(
  event: SubmitKey,
  focused: InForm<F> | null,
  apple = isApple(),
): F | null {
  const modifier = apple ? event.metaKey : event.ctrlKey;

  if (event.key !== "Enter" || !modifier || event.repeat || event.isComposing) return null;

  return focused?.closest("form") ?? null;
}
