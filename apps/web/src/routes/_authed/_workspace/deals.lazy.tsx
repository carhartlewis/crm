import { createLazyFileRoute } from "@tanstack/react-router";
import { DealsTable } from "../../../components/deals/deals-table.tsx";
import { RecordsPage } from "../../../components/records/records-page.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/deals")({
  component: Deals,
});

function Deals() {
  const { session } = Route.useRouteContext();

  return (
    <RecordsPage create="deal" createLabel="New deal" title="Deals">
      {(workspaceId) => (
        // Another workspace is another list: fresh selection, position and filters.
        <DealsTable key={workspaceId} userId={session.user.id} workspaceId={workspaceId} />
      )}
    </RecordsPage>
  );
}
