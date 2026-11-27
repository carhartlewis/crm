import chevronDown from "@carbon/icons/es/chevron--down/16.js";
import { isPermissionMode, type PermissionMode } from "@crm/core/chat";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Kbd } from "@crm/ui/components/kbd";
import { useRef, useState } from "react";
import { PERMISSION_MODE_OPTIONS, permissionModeLabel } from "../../lib/permission-mode.ts";

const ChevronIcon = carbonIcon(chevronDown);

export interface PermissionModeMenuProps {
  readonly value: string;
  readonly onChange: (mode: PermissionMode) => void;
  readonly disabled?: boolean;
}

/**
 * How much the agent may do without asking (ADR 0019), beside Send as in comp-neo. The trigger
 * names the mode; the menu lists each with what it does. Pressing 1–3 while it is open picks one.
 * Picking closes the menu and puts the caret back in the composer it sits in: the next thing
 * is typing.
 */
export function PermissionModeMenu({ value, onChange, disabled = false }: PermissionModeMenuProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const pick = (next: string) => {
    if (isPermissionMode(next) && next !== value) onChange(next);

    setOpen(false);
    // After the menu returns focus to its trigger, move it on to the composer's text box.
    requestAnimationFrame(() =>
      trigger.current?.closest("form")?.querySelector("textarea")?.focus({ preventScroll: true }),
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={trigger}
        disabled={disabled}
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Permissions: ${permissionModeLabel(value)}`}
          >
            {permissionModeLabel(value)}
            <ChevronIcon />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        onKeyDown={(event) => {
          const option = PERMISSION_MODE_OPTIONS[Number(event.key) - 1];

          if (option) pick(option.value);
        }}
      >
        <DropdownMenuRadioGroup value={value} onValueChange={pick}>
          {PERMISSION_MODE_OPTIONS.map((option, index) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
              {/* One column for the numbers, before the check mark's place. */}
              <span className="ml-4 shrink-0">
                <Kbd>{index + 1}</Kbd>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
