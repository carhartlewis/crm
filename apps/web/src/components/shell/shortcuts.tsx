import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useRouter } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { pageById, type PageId } from "../../lib/pages.ts";
import { readPinnedOrder } from "../../lib/pinned-order.ts";
import { matchesShortcut, pinnedShortcut, shortcuts } from "../../lib/shortcuts.ts";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

interface ShortcutTargets {
  readonly order: readonly PageId[];
  readonly onPalette: () => void;
  readonly back: () => void;
  readonly forward: () => void;
  readonly go: (to: string) => void;
}

/** The action a key press triggers, if any. */
function actionFor(event: KeyboardEvent, targets: ShortcutTargets): (() => void) | undefined {
  if (event.repeat) return undefined;

  if (matchesShortcut(event, shortcuts.palette)) return targets.onPalette;

  if (matchesShortcut(event, shortcuts.back)) return targets.back;

  if (matchesShortcut(event, shortcuts.forward)) return targets.forward;

  if (isEditable(event.target)) return undefined;

  if (matchesShortcut(event, shortcuts.home)) return () => targets.go("/");

  const id = targets.order.find((_, index) => {
    const shortcut = pinnedShortcut(index);

    return shortcut !== undefined && matchesShortcut(event, shortcut);
  });

  return id ? () => targets.go(pageById(id).to) : undefined;
}

/**
 * The shell's global keys (⌘B lives with the sidebar). ⌥-digit shortcuts stay out of text
 * fields, where Option types characters; ⌘ shortcuts work everywhere. Never animated.
 *
 * The listener reads only stable things (the router, the pinned-order store, a state setter),
 * so it never goes stale. Key this component by user so a different account remounts it.
 */
export function Shortcuts({
  userId,
  setPaletteOpen,
}: {
  userId: string;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const router = useRouter();

  useMountEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const action = actionFor(event, {
        order: readPinnedOrder(userId),
        onPalette: () => setPaletteOpen((open) => !open),
        back: () => router.history.back(),
        forward: () => router.history.forward(),
        go: (to) => void router.navigate({ to }),
      });

      if (!action) return;

      event.preventDefault();
      action();
    };

    window.addEventListener("keydown", listener);

    return () => window.removeEventListener("keydown", listener);
  });

  return null;
}
