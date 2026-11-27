import { Button } from "@crm/ui/components/button";
import { Kbd } from "@crm/ui/components/kbd";
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
import { useState } from "react";
import { CompaniesTable } from "../../../components/companies/companies-table.tsx";
import { sessionQuery } from "../../../lib/session.ts";
import { shortcutKeys, shortcuts } from "../../../lib/shortcuts.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/companies")({
  component: Companies,
});

function Companies() {
  const { session } = Route.useRouteContext();
  const { data: current } = useSuspenseQuery(sessionQuery);
  const workspaceId = current?.session.activeOrganizationId;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageShell>
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>Companies</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New company
            <Kbd data-icon="inline-end">{shortcutKeys(shortcuts.create).join("")}</Kbd>
          </Button>
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>
        {workspaceId ? (
          <CompaniesTable
            // Another workspace is another list: fresh selection, position and filters.
            key={workspaceId}
            userId={session.user.id}
            workspaceId={workspaceId}
            createOpen={createOpen}
            setCreateOpen={setCreateOpen}
          />
        ) : null}
      </PageShellContent>
    </PageShell>
  );
}
