import { createLazyFileRoute } from "@tanstack/react-router";
import { UsageSettings } from "../../../../components/settings/usage-settings.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/usage")({
  component: UsagePage,
});

function UsagePage() {
  const { session } = Route.useRouteContext();
  const { currentMonth } = Route.useLoaderData();

  return (
    <UsageSettings
      currentMonth={currentMonth}
      userId={session.user.id}
      workspaceId={session.session.activeOrganizationId ?? ""}
    />
  );
}
