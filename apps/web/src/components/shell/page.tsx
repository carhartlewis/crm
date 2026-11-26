import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@crm/ui/components/empty";
import {
  PageShell,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { WorkspacePageHeader } from "./page-header.tsx";
import type { ReactNode } from "react";
import type { Page } from "../../lib/pages.ts";

/** A workspace page in the vms.dev page shell: title bar, then content. */
export function PageLayout({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <PageShell>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{page.label}</PageShellTitle>
        </PageShellHeading>
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
