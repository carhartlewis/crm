import checkmark from "@carbon/icons/es/checkmark/16.js";
import misuse from "@carbon/icons/es/misuse--outline/16.js";
import time from "@carbon/icons/es/time/16.js";
import warning from "@carbon/icons/es/warning--alt/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import { cn } from "cn";
import type { ReactNode } from "react";

const CheckIcon = carbonIcon(checkmark);
const WarningIcon = carbonIcon(warning);
const WaitingIcon = carbonIcon(time);
const DeniedIcon = carbonIcon(misuse);

/**
 * One line for each tool the agent calls, as in comp-neo: "Creating company". While it runs, three
 * dots pulse and the label dims; done shows a check; failed shows a warning with the error on its
 * own line beneath; waiting is a call the person still has to approve; denied is one they refused.
 * The state is also read out after the label, so it doesn't rest on the icon alone.
 */
export const TOOL_STEP_STATES = ["pending", "waiting", "done", "failed", "denied"] as const;

export type ToolStepState = (typeof TOOL_STEP_STATES)[number];

const SPOKEN: Record<ToolStepState, string> = {
  pending: "running",
  waiting: "waiting for approval",
  done: "done",
  failed: "failed",
  denied: "denied",
};

function Dots() {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
      <span className="size-1 animate-pulse rounded-full bg-muted-foreground enter-delay-1" />
      <span className="size-1 animate-pulse rounded-full bg-muted-foreground enter-delay-2" />
    </span>
  );
}

export function ToolStep({
  label,
  detail,
  state,
  error,
}: {
  /** What the tool does, such as "Create company". */
  label: ReactNode;
  /** What it acts on, such as the company's name; dimmed after the label. */
  detail?: ReactNode;
  state: ToolStepState;
  /** Why it failed, shown under the label when `state` is "failed". */
  error?: ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 select-none"
      data-slot="tool-step"
      data-state={state}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {state === "pending" && <Dots />}
          {state === "waiting" && <WaitingIcon className="size-3.5" />}
          {state === "done" && <CheckIcon className="size-3.5 text-success" />}
          {state === "failed" && <WarningIcon className="size-3.5 text-destructive" />}
          {state === "denied" && <DeniedIcon className="size-3.5" />}
        </span>
        <span
          className={cn(
            "min-w-0 truncate",
            state === "pending" || state === "denied" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
          {detail && <span className="text-muted-foreground select-text"> · {detail}</span>}
          <span className="sr-only">, {SPOKEN[state]}</span>
        </span>
      </div>
      {state === "failed" && error && (
        <p className="pl-6 text-xs text-pretty text-destructive select-text">{error}</p>
      )}
    </div>
  );
}

/** Consecutive tool steps, 6px apart. */
export function ToolSteps({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-slot="tool-steps">
      {children}
    </div>
  );
}
