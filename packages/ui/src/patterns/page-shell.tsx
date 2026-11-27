import { cn } from "cn";
import {
  SkeletonBlock,
  SkeletonControl,
  type SkeletonControlWidth,
  SkeletonLine,
} from "@crm/ui/patterns/skeleton-lines";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import { VisuallyHidden } from "@crm/ui/patterns/visually-hidden";
import type * as React from "react";
import { observeReflow } from "@crm/ui/lib/reflow";

export type PageWidth = "standard" | "full" | "narrow";

function PageShell({
  className,
  contained = false,
  width = "standard",
  ...props
}: React.ComponentProps<"div"> & { contained?: boolean; width?: PageWidth }) {
  return (
    <main
      // Width changes (the sidebar, a resize) mark a reflow, so narrow switches fade only then.
      ref={observeReflow}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col outline-none",
        contained ? "min-h-0 overflow-hidden" : "overflow-y-auto scrollbar-gutter-stable",
      )}
      data-slot="page-shell-scroll"
    >
      <div
        className={cn(
          "group/page-shell flex w-full min-w-0 flex-1 flex-col px-4 pb-6 md:px-8 md:pb-10",
          contained && "min-h-0 *:data-[slot=page-shell-content]:min-h-0",
          className,
        )}
        data-slot="page-shell"
        data-width={width}
        {...props}
      />
    </main>
  );
}

/**
 * The page's title row. `leading` sits at the row's start, outside the centered content column
 * (e.g. the app's sidebar toggle), on the same line as the title.
 */
function PageShellHeader({
  className,
  children,
  leading,
  ...props
}: React.ComponentProps<"div"> & { leading?: React.ReactNode }) {
  return (
    <header
      className={cn(
        "-mx-4 flex items-center gap-3 border-b px-4 select-none md:-mx-8 md:px-8",
        className,
      )}
      data-slot="page-shell-header"
      {...props}
    >
      {leading}
      <div className="mx-auto grid min-h-12 w-full min-w-0 flex-1 grid-cols-page-header items-center gap-x-3 py-2 group-data-[width=narrow]/page-shell:max-w-3xl group-data-[width=standard]/page-shell:max-w-360 sm:min-h-16 sm:gap-x-4">
        {children}
      </div>
    </header>
  );
}

function PageShellHeading({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("contents", className)} data-slot="page-shell-heading" {...props} />;
}

function PageShellTitle({ className, children, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "col-start-1 row-start-1 min-w-0 self-center text-balance text-heading-20",
        className,
      )}
      data-slot="page-shell-title"
      {...props}
    >
      {children}
    </h1>
  );
}

function PageShellActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 self-center max-sm:[&_[data-slot=button]:not([data-size^=icon])]:h-8 max-sm:[&_[data-slot=button]:not([data-size^=icon])]:px-3",
        className,
      )}
      data-slot="page-shell-actions"
      {...props}
    />
  );
}

function PageShellContent({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "@container/page-content mx-auto flex w-full flex-1 flex-col gap-6 pt-5 group-data-[width=narrow]/page-shell:max-w-3xl group-data-[width=standard]/page-shell:max-w-360",
        className,
      )}
      data-slot="page-shell-content"
      {...props}
    >
      {children}
    </div>
  );
}

function PageShellSkeleton({
  width = "standard",
  action = false,
  table,
  contained = table !== undefined,
  children,
}: {
  width?: PageWidth;
  action?: boolean | SkeletonControlWidth;
  table?: { controls: number };
  contained?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <PageShell aria-busy contained={contained} width={width}>
      <PageShellHeader>
        <PageShellHeading>
          <div className="col-start-1 row-start-1">
            <SkeletonLine size="lg" width="48" />
          </div>
        </PageShellHeading>
        {action ? (
          <PageShellActions>
            <SkeletonControl width={action === true ? "32" : action} />
          </PageShellActions>
        ) : null}
      </PageShellHeader>
      <PageShellContent>
        {table ? (
          <TableSkeleton controls={table.controls} />
        ) : (
          (children ?? <SkeletonBlock height="56" />)
        )}
      </PageShellContent>
      <VisuallyHidden>{UI_COPY.loading}</VisuallyHidden>
    </PageShell>
  );
}

const TABLE_CONTROLS: { name: string; width: SkeletonControlWidth }[] = [
  { name: "view", width: "32" },
  { name: "filters", width: "24" },
  { name: "sort", width: "20" },
  { name: "columns", width: "28" },
];

const TABLE_SKELETON_ROW_KEYS = ["1", "2", "3", "4", "5"];

function TableSkeleton({ controls }: { controls: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full sm:w-64">
          <SkeletonControl width="full" />
        </div>
        <div className="sm:hidden">
          <SkeletonControl width="full" />
        </div>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {TABLE_CONTROLS.slice(TABLE_CONTROLS.length - controls).map((control) => (
            <SkeletonControl key={control.name} width={control.width} />
          ))}
        </div>
      </div>
      <div className="flex flex-col rounded-md bg-card shadow-hairline">
        <div className="flex h-10 items-center px-4 inset-shadow-hairline">
          <SkeletonLine width="24" />
        </div>
        {TABLE_SKELETON_ROW_KEYS.map((rowKey) => (
          <div
            className="flex items-center gap-6 px-4 py-4 not-last:inset-shadow-hairline"
            key={rowKey}
          >
            <div className="flex-1">
              <SkeletonLine width="72" />
            </div>
            <div className="hidden w-64 gap-6 md:flex">
              <SkeletonLine width="24" />
              <SkeletonLine width="24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeader,
  PageShellHeading,
  PageShellSkeleton,
  PageShellTitle,
};
