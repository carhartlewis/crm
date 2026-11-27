import { createLazyFileRoute } from "@tanstack/react-router";
import { FieldsSettings } from "../../../../components/fields/fields-settings.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/fields")({
  component: FieldsPage,
});

function FieldsPage() {
  const { session } = Route.useRouteContext();
  const { entity = "company" } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <FieldsSettings
      entity={entity}
      onEntity={(next) => void navigate({ search: { entity: next }, replace: true })}
      userId={session.user.id}
      workspaceId={session.session.activeOrganizationId ?? ""}
    />
  );
}
