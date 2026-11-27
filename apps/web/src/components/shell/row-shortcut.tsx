import { Kbd } from "@crm/ui/components/kbd";
import { shortcutKeys, type Shortcut } from "../../lib/shortcuts.ts";

/**
 * A sidebar row's hotkey, shown at its end while the row is hovered or focused (as in Glass).
 * Decorative: the link's `aria-keyshortcuts` carries it for screen readers.
 */
export function RowShortcut({ shortcut }: { shortcut: Shortcut | undefined }) {
  if (!shortcut) return null;

  return (
    <span
      aria-hidden
      className="ml-auto hidden items-center gap-0.5 group-focus-within/menu-item:flex group-hover/menu-item:flex"
    >
      {shortcutKeys(shortcut).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
