import { cn } from "cn";
import type { ReactNode } from "react";

export function RecordSection({
  label,
  count,
  action,
  children,
  className,
}: {
  label: string;
  count?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2.5 border-t pt-4.5 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div
        className="flex min-h-7 min-w-0 items-center justify-between gap-4"
        data-slot={count === undefined && !action ? "record-section-heading" : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-balance font-medium text-label text-muted-foreground">{label}</h3>
          {count === undefined ? null : (
            <span className="text-label text-muted-foreground tabular-nums">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
