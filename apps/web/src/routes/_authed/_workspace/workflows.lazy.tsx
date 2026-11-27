import { createLazyFileRoute } from "@tanstack/react-router";
import { EmptyState, PageLayout } from "../../../components/shell/page.tsx";
import { pageById } from "../../../lib/pages.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/workflows")({
  component: Workflows,
});

function Workflows() {
  return (
    <PageLayout page={pageById("workflows")}>
      <EmptyState page={pageById("workflows")} title="No workflows yet">
        Workflows will run automatically when records change.
      </EmptyState>
    </PageLayout>
  );
}
