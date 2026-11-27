import { createFileRoute } from "@tanstack/react-router";
import { workspaceQuery } from "../../../../lib/session.ts";

/** Workspace settings: name and website. The page is in index.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/settings/")({
  loader: ({ context: { queryClient, session } }) =>
    queryClient.fetchQuery(
      workspaceQuery(session.user.id, session.session.activeOrganizationId ?? ""),
    ),
});
