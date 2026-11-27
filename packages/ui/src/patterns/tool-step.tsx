import checkmark from "@carbon/icons/es/checkmark/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
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
const ChevronIcon = carbonIcon(chevronRight);

/**
 * One line for each tool the agent calls, as in comp-neo: "Create company". While it runs, the dot
 * matrix pulses and the label dims; waiting (for an approval) holds the dots still; done shows a
 * small check; failed and denied are the dimmed label alone. A failed call isn't flagged: the
 * agent works around it, and the reply says what matters.
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
  cost,
  state,
}: {
  /** What the tool does, such as "Create company". */
  label: ReactNode;
  /** What it acts on, such as the company's name; dimmed after the label. */
  detail?: ReactNode;
  /** What the call cost, such as "$0.24" or "No charge"; at the end of the line. */
  cost?: ReactNode;
  state: ToolStepState;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-sm select-none"
      data-slot="tool-step"
      data-state={state}
    >
      <StepIcon state={state} />
      <StepLabel label={label} detail={detail} state={state} />
      <StepCost cost={cost} />
    </div>
  );
}

/** A call's price after its label, in tabular figures so a run of prices lines up. */
function StepCost({ cost }: { cost: ReactNode }) {
  if (cost === undefined || cost === null || cost === "") return null;

  return (
    <span
      className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums"
      data-slot="tool-step-cost"
    >
      {cost}
    </span>
  );
}

function StepIcon({ state }: { state: ToolStepState }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
      {state === "pending" && <DotMatrix decorative />}
      {state === "waiting" && <DotMatrix decorative still />}
      {state === "done" && <CheckIcon className="size-3.5" />}
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
        state === "done" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {/* A running step's label shimmers, as in T3 Code. */}
      <span className={state === "pending" ? "text-shimmer" : undefined}>{label}</span>
      {detail && <span className="text-muted-foreground select-text"> · {detail}</span>}
      <span className="sr-only">, {SPOKEN[state]}</span>
    </span>
  );
}

/**
 * A run of calls to one tool as one line, such as "Lookup company · Capgo, Docspring and 4 more".
 * Its state is the run's: waiting or running while any call is, done when one succeeded. The
 * calls themselves open beneath it.
 */
export function ToolStepGroup({
  label,
  detail,
  cost,
  state,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  /** What the calls act on, together. */
  detail?: ReactNode;
  /** What the calls cost together. */
  cost?: ReactNode;
  state: ToolStepState;
  defaultOpen?: boolean;
  /** The calls, as `ToolStep`s. */
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-slot="tool-step-group" data-state={state}>
      <StepTrigger label={label} detail={detail} cost={cost} state={state} />
      <CollapsibleContent>
        <div className="mt-1.5 ml-1.75 flex min-w-0 flex-col gap-1.5 border-l pl-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * One call with what it showed beneath it, such as a list call's table. The step opens and closes
 * it; `defaultOpen` sets where it starts (the chat opens only the turn's latest result).
 */
export function ToolStepResult({
  label,
  detail,
  cost,
  state,
  defaultOpen = true,
  children,
}: {
  label: ReactNode;
  /** Text only: the step is a button, so it can't hold a link or another button. */
  detail?: ReactNode;
  /** What the call cost. */
  cost?: ReactNode;
  state: ToolStepState;
  defaultOpen?: boolean;
  /** The result, such as a table. */
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-slot="tool-step-result" data-state={state}>
      <StepTrigger label={label} detail={detail} cost={cost} state={state} />
      <CollapsibleContent>
        <div className="mt-2 min-w-0">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A step's line as the button that opens what is beneath it, with a chevron on hover. */
function StepTrigger({
  label,
  detail,
  cost,
  state,
}: {
  label: ReactNode;
  detail?: ReactNode;
  cost?: ReactNode;
  state: ToolStepState;
}) {
  return (
    <CollapsibleTrigger className="group/steps flex w-full min-w-0 items-center gap-2 text-left text-sm">
      <StepIcon state={state} />
      <StepLabel label={label} detail={detail} state={state} />
      <StepCost cost={cost} />
      <ChevronIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover/steps:opacity-100 group-focus-visible/steps:opacity-100 group-data-panel-open/steps:rotate-90 group-data-panel-open/steps:opacity-100" />
    </CollapsibleTrigger>
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
