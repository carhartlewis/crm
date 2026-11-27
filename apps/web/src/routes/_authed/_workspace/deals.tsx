import { createFileRoute } from "@tanstack/react-router";
import { sessionQuery } from "../../../lib/session.ts";

/**
 * Deals. The loader starts the syncs as soon as the route preloads (hover, predicted click),
 * through dynamic imports so TanStack DB and Electric stay out of the cold-entry bundle. The
 * table shows each deal's company, so companies sync too. The page itself is in
 * deals.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/deals")({
  loader: async ({ context }) => {
    const workspaceId = context.queryClient.getQueryData(sessionQuery.queryKey)?.session
      .activeOrganizationId;

    if (!workspaceId) return;

    const [{ companiesCollection }, { contactsCollection }, { dealsCollection }] =
      await Promise.all([
        import("../../../lib/companies.ts"),
        import("../../../lib/contacts.ts"),
        import("../../../lib/deals.ts"),
      ]);

    void companiesCollection(workspaceId).preload();
    void contactsCollection(workspaceId).preload();
    void dealsCollection(workspaceId).preload();
    // The footer totals in the reporting currency.
    void import("../../../lib/money.ts").then(({ workspaceSettingsCollection }) =>
      workspaceSettingsCollection(workspaceId).preload(),
    );
  },
});
