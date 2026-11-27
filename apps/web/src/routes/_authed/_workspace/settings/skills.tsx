import { createFileRoute } from "@tanstack/react-router";

/**
 * Skills shared by the workspace. The page is in skills.lazy.tsx. Skills sync through Electric:
 * the loader waits for their first snapshot, so the page renders with data. A dynamic import
 * keeps TanStack DB and Electric out of cold entry.
 */
export const Route = createFileRoute("/_authed/_workspace/settings/skills")({
  loader: async ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";
    const skills = await import("../../../../lib/skills.ts");

    await skills.skillsCollection(workspaceId).preload();
  },
});
