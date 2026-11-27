import { createLazyFileRoute } from "@tanstack/react-router";
import { CompaniesTable } from "../../../components/companies/companies-table.tsx";
import { RecordsPage } from "../../../components/records/records-page.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/companies")({
  component: Companies,
});

function Companies() {
  const { session } = Route.useRouteContext();

  return (
    <RecordsPage create="company" createLabel="New company" title="Companies">
      {(workspaceId) => (
        // Another workspace is another list: fresh selection, position and filters.
        <CompaniesTable key={workspaceId} userId={session.user.id} workspaceId={workspaceId} />
      )}
    </RecordsPage>
  );
}
