import { createFileRoute } from "@tanstack/react-router";
import { sessionQuery } from "../../../lib/session.ts";

/**
 * Contacts. The loader starts the syncs as soon as the route preloads (hover, predicted click),
 * through dynamic imports so TanStack DB and Electric stay out of the cold-entry bundle. The
 * table shows each contact's company, so companies sync too. The page itself is in
 * contacts.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/contacts")({
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
  },
});
