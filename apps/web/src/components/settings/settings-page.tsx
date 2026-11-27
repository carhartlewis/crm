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
  wide = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  /** Full width, for the memory graph; otherwise a readable column. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{title}</PageShellTitle>
        </PageShellHeading>
        {actions ? <PageShellActions>{actions}</PageShellActions> : null}
      </WorkspacePageHeader>
      <PageShellContent>
        <div
          className={
            wide
              ? "flex w-full animate-enter flex-col gap-4"
              : "mx-auto flex w-full max-w-2xl animate-enter flex-col gap-8"
          }
        >
          {children}
        </div>
      </PageShellContent>
    </PageShell>
  );
}
