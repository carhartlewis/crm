import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import checkmarkOutline16 from "@carbon/icons/es/checkmark--outline/16.js";
import circleDash16 from "@carbon/icons/es/circle-dash/16.js";
import warning16 from "@carbon/icons/es/warning/16.js";
import { cn } from "cn";
import type { ReactNode } from "react";
import { carbonIcon } from "@crm/ui/components/icon";
import { ProgressIndicator, ProgressTrack } from "@crm/ui/components/progress";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import { FormattedDate } from "@crm/ui/patterns/formatted-date";
import { formatCount, formatDay, formatPercent, UI_COPY } from "@crm/ui/patterns/ui-copy";

export function TitleCell({ children, leading }: { children: string; leading?: ReactNode }) {
  if (!children.trim()) return <EmptyCellDash />;

  if (!leading) {
    return <span className="block min-w-0 truncate font-medium">{children}</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0">{leading}</span>
      <span className="block min-w-0 truncate font-medium">{children}</span>
    </span>
  );
}

export function TextCell({ children }: { children: string | null }) {
  return children?.trim() ? (
    <span className="block truncate text-muted-foreground">{children}</span>
  ) : (
    <EmptyCellDash />
  );
}

export function DateCell({ value }: { value: string | null }) {
  return (
    <span className="tabular-nums text-muted-foreground">
      <FormattedDate fallback={<EmptyCellDash />} value={value} />
    </span>
  );
}

export function DayCell({ value }: { value: string | null }) {
  return value ? (
    <span className="tabular-nums text-muted-foreground">{formatDay(value)}</span>
  ) : (
    <EmptyCellDash />
  );
}

export function CountCell({ children }: { children: string }) {
  if (!children.trim()) return <EmptyCellDash />;

  return <span className="tabular-nums text-muted-foreground">{children}</span>;
}

export function TableCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total === 0) return null;

  return (
    <span className="text-label text-muted-foreground tabular-nums">
      {UI_COPY.tableCount({
        shown: formatCount(shown),
        total: formatCount(total),
        noun,
      })}
    </span>
  );
}

export function ProgressCell({ value, muted = false }: { value: number; muted?: boolean }) {
  const percent = Math.min(100, Math.max(0, value));

  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProgressPrimitive.Root aria-hidden className="min-w-0 flex-1" value={percent}>
        <ProgressTrack>
          <ProgressIndicator data-muted={muted || undefined} />
        </ProgressTrack>
      </ProgressPrimitive.Root>
      <span className="w-10 shrink-0 text-right tabular-nums">{formatPercent(percent)}</span>
    </span>
  );
}

export type StatusTone = "done" | "open" | "alert";

const STATUS_TONE = {
  done: { Icon: carbonIcon(checkmarkOutline16), className: "text-foreground" },
  open: { Icon: carbonIcon(circleDash16), className: "text-muted-foreground" },
  alert: { Icon: carbonIcon(warning16), className: "text-destructive" },
} as const satisfies Record<StatusTone, { Icon: ReturnType<typeof carbonIcon>; className: string }>;

export function StatusCell({
  tone,
  children,
  labelClassName,
}: {
  tone: StatusTone;
  children: string;
  labelClassName?: string;
}) {
  const { Icon, className } = STATUS_TONE[tone];

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Icon className="size-4 shrink-0" />
      <span className={cn("truncate", labelClassName)}>{children}</span>
    </span>
  );
}

export function RedactedCell({ placeholder, label }: { placeholder: string; label: string }) {
  return (
    <span className="block min-w-0 truncate">
      <span aria-hidden className="select-none text-muted-foreground blur-xs">
        {placeholder}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
