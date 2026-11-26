import { createLazyFileRoute } from "@tanstack/react-router";
import { EmptyState, PageLayout } from "../../../components/shell/page.tsx";
import { pageById } from "../../../lib/pages.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/connections")({
  component: Connections,
});

function Connections() {
  return (
    <PageLayout page={pageById("connections")}>
      <EmptyState title="Nothing connected yet">
        Connect email and calendar to fill your CRM from real conversations.
      </EmptyState>
    </PageLayout>
  );
}
