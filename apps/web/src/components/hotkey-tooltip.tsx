import { Kbd } from "@crm/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";
import type { ReactElement } from "react";
import { ariaKeyShortcuts, shortcutKeys, type Shortcut } from "../lib/shortcuts.ts";

export interface HotkeyTooltipProps {
  readonly shortcut: Shortcut;
  /** The control (a Button): the tooltip renders through it, so it keeps its own props. */
  readonly children: ReactElement;
  readonly side?: "left" | "right" | "top" | "bottom";
}

/**
 * The house way to show a hotkey: its key caps in a small chip beside the control, never inside
 * its label (as in Glass). Opens to the right, flipping left when there's no room. The control
 * gets `aria-keyshortcuts`, so screen readers announce it too.
 */
export function HotkeyTooltip({ shortcut, children, side = "right" }: HotkeyTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={400}
        aria-keyshortcuts={ariaKeyShortcuts(shortcut)}
        render={children}
      />
      <TooltipContent variant="keys" side={side} sideOffset={6}>
        {shortcutKeys(shortcut).map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
