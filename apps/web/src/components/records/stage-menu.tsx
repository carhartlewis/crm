import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import { DEAL_STAGES, dealStage, isLosingStage } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { StatusDot } from "@crm/ui/components/status-dot";
import { useRef, useState } from "react";

const ChevronIcon = carbonIcon(chevronDown16);

export interface StageChange {
  readonly stage: string;
  readonly closed_reason?: string;
}

/**
 * The deal's stage as a menu: a button in the sheet header, or a quiet cell in tables. Moving
 * to Closed lost or Unqualified asks why first, as the API requires.
 */
export function StageMenu({
  stage,
  onChange,
  variant = "control",
}: {
  stage: string;
  onChange: (change: StageChange) => void;
  variant?: "control" | "cell";
}) {
  const [losing, setLosing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const current = dealStage(stage);
  const reasonInput = useRef<HTMLInputElement>(null);
  const triggerLabel = `Stage: ${current.label}`;

  const choose = (next: string) => {
    if (next === stage) return;

    if (isLosingStage(next)) {
      setReason("");
      setLosing(next);

      return;
    }

    onChange({ stage: next });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            variant === "control" ? (
              <Button aria-label={triggerLabel} size="sm" variant="outline" />
            ) : (
              <button
                aria-label={triggerLabel}
                className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-0.5 text-muted-foreground outline-none pointer-fine:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
              />
            )
          }
        >
          <StatusDot tone={current.tone} />
          <span className="truncate">{current.label}</span>
          {variant === "control" ? <ChevronIcon className="size-4 text-muted-foreground" /> : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === "control" ? "end" : "start"}>
          <DropdownMenuRadioGroup onValueChange={(next: string) => choose(next)} value={stage}>
            {DEAL_STAGES.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                <StatusDot tone={option.tone} />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={(open) => !open && setLosing(null)} open={losing !== null}>
        <DialogContent initialFocus={() => reasonInput.current}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();

              if (!losing || !reason.trim()) return;

              onChange({ stage: losing, closed_reason: reason.trim() });
              setLosing(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {losing ? `Mark as ${dealStage(losing).label.toLowerCase()}` : ""}
              </DialogTitle>
              <DialogDescription>Say why, so the team can learn from it.</DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Reason"
              maxLength={500}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Went with a competitor on price"
              ref={reasonInput}
              value={reason}
            />
            <DialogFooter>
              <Button onClick={() => setLosing(null)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={!reason.trim()} type="submit">
                Close deal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
