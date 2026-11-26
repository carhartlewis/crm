import { cn } from "cn";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";

export function EmptyCellValue({ className }: { className?: string }) {
  return <span className={cn("sr-only", className)}>{UI_COPY.none}</span>;
}

export function EmptyCellDash({ className }: { className?: string }) {
  return (
    <span className={cn("text-muted-foreground", className)}>
      <span aria-hidden="true">-</span>
      <EmptyCellValue />
    </span>
  );
}
