import checkmark from "@carbon/icons/es/checkmark/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import warning from "@carbon/icons/es/warning--alt/16.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { carbonIcon } from "@crm/ui/components/icon";
import { DotMatrix } from "@crm/ui/patterns/dot-matrix";
import { cn } from "cn";
import type { ReactNode } from "react";

const CheckIcon = carbonIcon(checkmark);
const WarningIcon = carbonIcon(warning);
const ChevronIcon = carbonIcon(chevronRight);

/**
 * One line for each tool the agent calls, as in comp-neo: "Create company". While it runs, the dot
 * matrix pulses and the label dims; waiting (for an approval) holds the dots still; done shows a
 * small check; failed a warning with the error beneath; denied is the dimmed label alone.
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
        <StepIcon state={state} />
        <StepLabel label={label} detail={detail} state={state} />
      </div>
      {state === "failed" && error && (
        <p className="pl-6 text-xs text-pretty text-destructive select-text">{error}</p>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: ToolStepState }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
      {state === "pending" && <DotMatrix decorative />}
      {state === "waiting" && <DotMatrix decorative still />}
      {state === "done" && <CheckIcon className="size-3.5" />}
      {state === "failed" && <WarningIcon className="size-3.5 text-destructive" />}
    </span>
  );
}

function StepLabel({
  label,
  detail,
  state,
}: {
  label: ReactNode;
  detail?: ReactNode;
  state: ToolStepState;
}) {
  return (
    // `relative`: the spoken state (sr-only, absolute) stays inside the clipped label instead of
    // sitting where the untruncated text would end and widening the conversation.
    <span
      className={cn(
        "relative min-w-0 truncate",
        state === "done" || state === "failed" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      {detail && <span className="text-muted-foreground select-text"> · {detail}</span>}
      <span className="sr-only">, {SPOKEN[state]}</span>
    </span>
  );
}

/**
 * A run of calls to one tool as one line, such as "Lookup company · Capgo, Docspring and 4 more".
 * Its state is the run's: waiting or running while any call is, failed when one failed. The
 * calls themselves open beneath it.
 */
export function ToolStepGroup({
  label,
  detail,
  state,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  /** What the calls act on, together. */
  detail?: ReactNode;
  state: ToolStepState;
  defaultOpen?: boolean;
  /** The calls, as `ToolStep`s. */
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-slot="tool-step-group" data-state={state}>
      <CollapsibleTrigger className="group/steps flex w-full min-w-0 items-center gap-2 text-left text-sm">
        <StepIcon state={state} />
        <StepLabel label={label} detail={detail} state={state} />
        <ChevronIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover/steps:opacity-100 group-focus-visible/steps:opacity-100 group-data-panel-open/steps:rotate-90 group-data-panel-open/steps:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 ml-1.75 flex min-w-0 flex-col gap-1.5 border-l pl-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
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
