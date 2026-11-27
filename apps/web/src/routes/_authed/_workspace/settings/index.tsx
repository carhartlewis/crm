import { createFileRoute } from "@tanstack/react-router";
import { workspaceQuery } from "../../../../lib/session.ts";
import { trackingSettingsQuery } from "../../../../lib/tracking.ts";

/** Workspace settings: name and website. The page is in index.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/settings/")({
  loader: async ({ context: { queryClient, session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";

    // Tracking's key is secondary: start it, but don't hold the page for it.
    void queryClient.prefetchQuery(trackingSettingsQuery(session.user.id, workspaceId));

    // The Currency cards read synced rows; start them without holding the page.
    void import("../../../../lib/money.ts").then((money) =>
      Promise.all([
        money.workspaceSettingsCollection(workspaceId).preload(),
        money.exchangeRatesCollection(workspaceId).preload(),
      ]),
    );

    return await queryClient.fetchQuery(workspaceQuery(session.user.id, workspaceId));
  },
});
