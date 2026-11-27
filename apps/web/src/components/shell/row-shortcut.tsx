import { Kbd } from "@crm/ui/components/kbd";
import { shortcutKeys, type Shortcut } from "../../lib/shortcuts.ts";

/**
 * A sidebar row's hotkey, shown at its end while the row is hovered or keyboard-focused (as in Glass;
 * a click leaves focus on the link, which must not keep it showing).
 * Decorative: the link's `aria-keyshortcuts` carries it for screen readers.
 */
export function RowShortcut({ shortcut }: { shortcut: Shortcut | undefined }) {
  if (!shortcut) return null;

  return (
    <span
      aria-hidden
      className="ml-auto hidden items-center gap-0.5 group-hover/menu-item:flex group-has-focus-visible/menu-item:flex"
    >
      {shortcutKeys(shortcut).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
