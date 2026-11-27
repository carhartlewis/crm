import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "../../../../components/settings/profile-settings.tsx";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { sessionQuery } from "../../../../lib/session.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/account")({
  component: Profile,
});

function Profile() {
  // The live session, not the guard's snapshot: a saved name or picture shows here at once.
  const { data } = useSuspenseQuery(sessionQuery);
  const { session } = Route.useRouteContext();

  return (
    <SettingsPage title="Profile">
      <ProfileSettings user={data?.user ?? session.user} />
    </SettingsPage>
  );
}
