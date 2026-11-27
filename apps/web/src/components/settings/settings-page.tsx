import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import type { ReactNode } from "react";
import { WorkspacePageHeader } from "../shell/page-header.tsx";

/**
 * A settings page: its title (and actions) in the title bar, then its content. Forms read in a
 * narrow centred column, and the title bar keeps to that column so title, actions and content
 * line up; tables and card grids use the page column every page shares.
 */
export function SettingsPage({
  title,
  actions,
  fill = false,
  table = false,
  wide = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  /** The whole window below the title bar, for the memory graph; otherwise a readable column. */
  fill?: boolean;
  /** The page column's height without scrolling, for a data table that pages what fits. */
  table?: boolean;
  /** The page column's full width, scrolling, for card grids; otherwise a readable column. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <PageShell
      contained={fill || table}
      width={fill ? "full" : table || wide ? "standard" : "narrow"}
    >
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{title}</PageShellTitle>
        </PageShellHeading>
        {actions ? <PageShellActions>{actions}</PageShellActions> : null}
      </WorkspacePageHeader>
      <PageShellContent>
        <div
          className={
            fill || table
              ? "flex min-h-0 w-full flex-1 animate-enter flex-col"
              : wide
                ? "flex w-full animate-enter flex-col gap-6"
                : "flex w-full animate-enter flex-col gap-8"
          }
        >
          {children}
        </div>
      </PageShellContent>
    </PageShell>
  );
}
