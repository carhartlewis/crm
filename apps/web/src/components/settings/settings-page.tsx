import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import type { ReactNode } from "react";
import { WorkspacePageHeader } from "../shell/page-header.tsx";

/** A settings page: its title (and actions) in the title bar, then a centred column. */
export function SettingsPage({
  title,
  actions,
  fill = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  /** The whole window below the title bar, for the memory graph; otherwise a readable column. */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <PageShell contained={fill} width={fill ? "full" : "standard"}>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{title}</PageShellTitle>
        </PageShellHeading>
        {actions ? <PageShellActions>{actions}</PageShellActions> : null}
      </WorkspacePageHeader>
      <PageShellContent>
        <div
          className={
            fill
              ? "flex min-h-0 w-full flex-1 animate-enter flex-col"
              : "mx-auto flex w-full max-w-2xl animate-enter flex-col gap-8"
          }
        >
          {children}
        </div>
      </PageShellContent>
    </PageShell>
  );
}
