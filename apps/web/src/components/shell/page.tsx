import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@crm/ui/components/empty";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { WorkspacePageHeader } from "./page-header.tsx";
import type { ReactNode } from "react";
import type { Page } from "../../lib/pages.ts";

/**
 * A workspace page in the vms.dev page shell: title bar (with optional actions), then content.
 * `contained` pages don't scroll: a data table fills the height and pages what fits.
 */
export function PageLayout({
  page,
  actions,
  contained = false,
  children,
}: {
  page: Page;
  actions?: ReactNode;
  contained?: boolean;
  children: ReactNode;
}) {
  return (
    <PageShell contained={contained}>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{page.label}</PageShellTitle>
        </PageShellHeading>
        {actions ? <PageShellActions>{actions}</PageShellActions> : null}
      </WorkspacePageHeader>
      <PageShellContent>{children}</PageShellContent>
    </PageShell>
  );
}

/** What a page shows before it has records. */
export function EmptyState({
  page,
  title,
  children,
}: {
  page: Page;
  title: string;
  children: ReactNode;
}) {
  const PageIcon = page.icon;

  return (
    <Empty variant="outline">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PageIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
