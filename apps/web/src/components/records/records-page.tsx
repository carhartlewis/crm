import { Button } from "@crm/ui/components/button";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOpenCreate } from "../../lib/create-sheet.ts";
import { sessionQuery } from "../../lib/session.ts";
import { shortcuts } from "../../lib/shortcuts.ts";
import { HotkeyTooltip } from "../hotkey-tooltip.tsx";
import { WorkspacePageHeader } from "../shell/page-header.tsx";
import { ResearchActivity } from "./research-indicator.tsx";

const CREATE_SHORTCUTS = {
  company: shortcuts.newCompany,
  contact: shortcuts.newContact,
  deal: shortcuts.newDeal,
} as const;

/**
 * A record list page (Companies, Contacts, Deals): the title, the New button with its hotkey and the table, keyed by workspace so a switch starts fresh.
 */
export function RecordsPage({
  title,
  create,
  createLabel,
  research = false,
  children,
}: {
  title: string;
  create: "company" | "contact" | "deal";
  createLabel: string;
  /** Shows the workspace's research beside the New button (companies and contacts). */
  research?: boolean;
  children: (workspaceId: string) => ReactNode;
}) {
  const { data: current } = useSuspenseQuery(sessionQuery);
  const workspaceId = current?.session.activeOrganizationId;
  const openCreate = useOpenCreate();

  return (
    <PageShell contained>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>{title}</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          {workspaceId && research ? <ResearchActivity workspaceId={workspaceId} /> : null}
          <HotkeyTooltip shortcut={CREATE_SHORTCUTS[create]} side="left">
            <Button onClick={() => void openCreate(create)} size="sm">
              {createLabel}
            </Button>
          </HotkeyTooltip>
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>{workspaceId ? children(workspaceId) : null}</PageShellContent>
    </PageShell>
  );
}
