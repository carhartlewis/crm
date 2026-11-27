"use client";

import checkmarkFilled16 from "@carbon/icons/es/checkmark--filled/16.js";
import checkmarkOutline16 from "@carbon/icons/es/checkmark--outline/16.js";
import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import circleDash16 from "@carbon/icons/es/circle-dash/16.js";
import errorOutline16 from "@carbon/icons/es/error--outline/16.js";
import misuseOutline16 from "@carbon/icons/es/misuse--outline/16.js";
import time16 from "@carbon/icons/es/time/16.js";
import tools16 from "@carbon/icons/es/tools/16.js";
import { cn } from "cn";
import { isValidElement, type ComponentProps, type ReactNode } from "react";
import { Badge } from "@crm/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { carbonIcon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";

const CheckmarkFilledIcon = carbonIcon(checkmarkFilled16);
const CheckmarkOutlineIcon = carbonIcon(checkmarkOutline16);
const ChevronDownIcon = carbonIcon(chevronDown16);
const CircleDashIcon = carbonIcon(circleDash16);
const ErrorIcon = carbonIcon(errorOutline16);
const MisuseIcon = carbonIcon(misuseOutline16);
const TimeIcon = carbonIcon(time16);
const ToolsIcon = carbonIcon(tools16);

/** A tool call's lifecycle. The same states as the AI SDK's tool parts, without depending on it. */
export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

const statusLabels: Record<ToolState, string> = {
  "approval-requested": "Awaiting approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolState, ReactNode> = {
  "approval-requested": <TimeIcon className="size-4" />,
  "approval-responded": <CheckmarkOutlineIcon className="size-4" />,
  "input-available": <Spinner className="size-4" />,
  "input-streaming": <CircleDashIcon className="size-4" />,
  "output-available": <CheckmarkFilledIcon className="size-4 text-success" />,
  "output-denied": <MisuseIcon className="size-4 text-muted-foreground" />,
  "output-error": <ErrorIcon className="size-4 text-destructive" />,
};

function ToolStatusBadge({ state }: { state: ToolState }) {
  return (
    <Badge className="shrink-0 gap-1.5 rounded-full text-xs" variant="secondary">
      {statusIcons[state]}
      {statusLabels[state]}
    </Badge>
  );
}

export type ToolProps = ComponentProps<typeof Collapsible>;

/** One tool call, folded to a header with its status; open it to see its input and result. */
function Tool({ className, ...props }: ToolProps) {
  return (
    <Collapsible
      data-slot="tool"
      className={cn("group/tool not-prose mb-4 w-full rounded-md border", className)}
      {...props}
    />
  );
}

export type ToolHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, "title"> & {
  state: ToolState;
  /** Shown as the tool's name. Falls back to `toolName`, then to `type` without its `tool-` prefix. */
  title?: string;
  toolName?: string;
  /** An AI SDK part type such as `tool-search_companies` or `dynamic-tool`. */
  type?: string;
};

function toolLabel(title?: string, toolName?: string, type?: string) {
  if (title) return title;

  if (toolName) return toolName;

  if (type && type !== "dynamic-tool") return type.split("-").slice(1).join("-");

  return "Tool";
}

function ToolHeader({ className, title, type, state, toolName, ...props }: ToolHeaderProps) {
  return (
    <CollapsibleTrigger
      data-slot="tool-header"
      className={cn("flex w-full min-w-0 items-center justify-between gap-4 p-3", className)}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ToolsIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{toolLabel(title, toolName, type)}</span>
        <ToolStatusBadge state={state} />
      </div>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-open/tool:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      data-slot="tool-content"
      className={cn("flex flex-col gap-4 p-4 text-popover-foreground outline-none", className)}
      {...props}
    />
  );
}

function Json({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto p-3 font-mono text-xs whitespace-pre select-text">
      <code>{value}</code>
    </pre>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-medium text-muted-foreground select-none">{children}</h4>;
}

export type ToolInputProps = ComponentProps<"div"> & {
  /** The arguments the agent passed, shown as JSON. */
  input: unknown;
};

function ToolInput({ className, input, ...props }: ToolInputProps) {
  return (
    <div
      data-slot="tool-input"
      className={cn("flex flex-col gap-2 overflow-hidden", className)}
      {...props}
    >
      <SectionLabel>Parameters</SectionLabel>
      <div className="rounded-md bg-muted/50">
        <Json value={JSON.stringify(input, null, 2) ?? ""} />
      </div>
    </div>
  );
}

export type ToolOutputProps = ComponentProps<"div"> & {
  /** The result: a React node renders as is, a string or an object renders as text or JSON. */
  output: unknown;
  errorText?: string;
};

function ToolOutput({ className, output, errorText, ...props }: ToolOutputProps) {
  if (!(output || errorText)) return null;

  // Objects and arrays print as JSON; strings and other primitives print as they are.
  let rendered: ReactNode = null;

  if (isValidElement(output)) rendered = output;
  else if (output instanceof Object) rendered = <Json value={JSON.stringify(output, null, 2)} />;
  else if (output !== undefined && output !== null) rendered = <Json value={String(output)} />;

  return (
    <div data-slot="tool-output" className={cn("flex flex-col gap-2", className)} {...props}>
      <SectionLabel>{errorText ? "Error" : "Result"}</SectionLabel>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
        )}
      >
        {errorText && <div className="p-3 text-pretty select-text">{errorText}</div>}
        {rendered}
      </div>
    </div>
  );
}

export { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, ToolStatusBadge };
