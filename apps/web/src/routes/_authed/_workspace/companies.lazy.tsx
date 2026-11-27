import { Button } from "@crm/ui/components/button";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { WorkspacePageHeader } from "../../../components/shell/page-header.tsx";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { CompaniesTable } from "../../../components/companies/companies-table.tsx";
import { sessionQuery } from "../../../lib/session.ts";
import { shortcuts } from "../../../lib/shortcuts.ts";
import { useCreateSheet } from "../../../lib/create-sheet.ts";
import { HotkeyTooltip } from "../../../components/hotkey-tooltip.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/companies")({
  component: Companies,
});

function Companies() {
  const { session } = Route.useRouteContext();
  const { data: current } = useSuspenseQuery(sessionQuery);
  const workspaceId = current?.session.activeOrganizationId;
  const [, setCreate] = useCreateSheet();

  return (
    <PageShell>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>Companies</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <HotkeyTooltip shortcut={shortcuts.create} side="left">
            <Button size="sm" onClick={() => void setCreate("company")}>
              New company
            </Button>
          </HotkeyTooltip>
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>
        {workspaceId ? (
          <CompaniesTable
            // Another workspace is another list: fresh selection, position and filters.
            key={workspaceId}
            userId={session.user.id}
            workspaceId={workspaceId}
          />
        ) : null}
      </PageShellContent>
    </PageShell>
  );
}
