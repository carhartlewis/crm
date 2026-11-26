import { createFileRoute } from "@tanstack/react-router";
import { sessionQuery } from "../../../lib/session.ts";

/**
 * Companies. The loader starts the sync as soon as the route preloads (hover, predicted click),
 * through a dynamic import so TanStack DB and Electric stay out of the cold-entry bundle.
 * The page itself is in companies.lazy.tsx.
 */
export const Route = createFileRoute("/_authed/_workspace/companies")({
  loader: async ({ context }) => {
    const workspaceId = context.queryClient.getQueryData(sessionQuery.queryKey)?.session
      .activeOrganizationId;

    if (!workspaceId) return;

    const { companiesCollection } = await import("../../../lib/companies.ts");

    void companiesCollection(workspaceId).preload();
  },
});
