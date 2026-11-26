import { Button } from "@crm/ui/components/button";
import { Kbd } from "@crm/ui/components/kbd";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CompaniesTable } from "../../../components/companies/companies-table.tsx";
import { sessionQuery } from "../../../lib/session.ts";

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
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>Companies</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New company
            <Kbd data-icon="inline-end">C</Kbd>
          </Button>
        </PageShellActions>
      </PageShellHeader>
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
