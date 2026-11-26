import { createLazyFileRoute } from "@tanstack/react-router";
import { EmptyState, PageLayout } from "../../../components/shell/page.tsx";
import { pageById } from "../../../lib/pages.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/contacts")({
  component: Contacts,
});

function Contacts() {
  return (
    <PageLayout page={pageById("contacts")}>
      <EmptyState page={pageById("contacts")} title="No contacts yet">
        People appear here as you add them or connect your email and calendar.
      </EmptyState>
    </PageLayout>
  );
}
