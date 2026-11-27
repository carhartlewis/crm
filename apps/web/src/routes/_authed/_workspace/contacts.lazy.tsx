import { createLazyFileRoute } from "@tanstack/react-router";
import { ContactsTable } from "../../../components/contacts/contacts-table.tsx";
import { RecordsPage } from "../../../components/records/records-page.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/contacts")({
  component: Contacts,
});

function Contacts() {
  const { session } = Route.useRouteContext();

  return (
    <RecordsPage create="contact" createLabel="New contact" title="Contacts">
      {(workspaceId) => (
        // Another workspace is another list: fresh selection, position and filters.
        <ContactsTable key={workspaceId} userId={session.user.id} workspaceId={workspaceId} />
      )}
    </RecordsPage>
  );
}
