import type { ReactNode } from "react";
import { formatDate } from "@crm/ui/patterns/ui-copy";

export function FormattedDate({
  value,
  fallback = null,
  className,
}: {
  value: string | Date | null | undefined;
  fallback?: ReactNode;
  className?: string;
}) {
  if (!value) {
    return fallback;
  }

  return <span className={className}>{formatDate(value)}</span>;
}
