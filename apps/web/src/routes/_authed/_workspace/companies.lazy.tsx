import { createLazyFileRoute } from "@tanstack/react-router";
import { EmptyState, PageLayout } from "../../../components/shell/page.tsx";
import { pageById } from "../../../lib/pages.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/companies")({
  component: Companies,
});

function Companies() {
  return (
    <PageLayout page={pageById("companies")}>
      <EmptyState title="No companies yet">
        Companies appear here as you add them or connect your email and calendar.
      </EmptyState>
    </PageLayout>
  );
}
