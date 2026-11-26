import chevronLeft16 from "@carbon/icons/es/chevron--left/16.js";
import chevronRight16 from "@carbon/icons/es/chevron--right/16.js";
import type { ReactNode } from "react";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { SkeletonLine } from "@crm/ui/patterns/skeleton-lines";
import { formatCount, UI_COPY } from "@crm/ui/patterns/ui-copy";

const ChevronLeftIcon = carbonIcon(chevronLeft16);
const ChevronRightIcon = carbonIcon(chevronRight16);

export function TablePagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  loading = false,
  meta,
  start,
  count,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  meta?: ReactNode;
  start?: number;
  count?: number;
}) {
  if (total === 0 && !loading) return null;

  const offset = start ?? (page - 1) * pageSize;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + (count ?? pageSize), total);

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 select-none"
      data-slot="table-pagination"
    >
      <span className="flex items-center gap-2 text-label text-muted-foreground tabular-nums">
        {loading && total === 0 ? (
          <SkeletonLine width="48" />
        ) : (
          (meta ??
          UI_COPY.showing({
            start: formatCount(rangeStart),
            end: formatCount(rangeEnd),
            total: formatCount(total),
          }))
        )}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            {UI_COPY.previous}
          </Button>
          <span className="text-label text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {UI_COPY.next}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  );
}
