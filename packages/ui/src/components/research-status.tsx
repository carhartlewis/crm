import time16 from "@carbon/icons/es/time/16.js";
import warning16 from "@carbon/icons/es/warning/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";

const TimeIcon = carbonIcon(time16);
const WarningIcon = carbonIcon(warning16);

/** Quiet, inline feedback. No completion badge or live announcement for every synced row. */
export function ResearchStatus({
  state,
  label,
  detail,
  compact = false,
}: {
  state: "queued" | "running" | "failed";
  label: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        tabIndex={0}
        aria-label={`${label}. ${detail}`}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm text-xs text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {state === "running" ? (
          <Spinner aria-hidden />
        ) : state === "failed" ? (
          <WarningIcon aria-hidden />
        ) : (
          <TimeIcon aria-hidden />
        )}
        {compact ? <span className="sr-only">{label}</span> : label}
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}
