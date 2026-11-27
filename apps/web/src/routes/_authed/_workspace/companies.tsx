import { createFileRoute } from "@tanstack/react-router";
import { sessionQuery } from "../../../lib/session.ts";

/**
 * Companies. The loader starts the syncs as soon as the route preloads (hover, predicted click),
 * through dynamic imports so TanStack DB and Electric stay out of the cold-entry bundle. The
 * table counts each company's contacts and open deals, so those sync too. The page itself is in
 * companies.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/companies")({
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
