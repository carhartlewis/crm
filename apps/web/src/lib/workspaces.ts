import { mutationOptions } from "@tanstack/react-query";
import { toWorkspaceInput, workspaceSlug, type WorkspaceInput } from "@crm/core/workspace";
import { authClient } from "./auth.ts";
import { resetAuth } from "./session.ts";
import { releaseSynced } from "./synced.ts";

/**
 * Creates a workspace (a better-auth organization; the server re-validates name and website).
 * The slug derives from the name; if it's taken, retries with a short random suffix.
 */
async function createWorkspace(value: WorkspaceInput) {
  const { name, website } = toWorkspaceInput(value);
  const suffixes = [undefined, ...Array.from({ length: 3 }, () => crypto.randomUUID().slice(0, 4))];

  for (const suffix of suffixes) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt depends on the previous one's result.
    const { data, error } = await authClient.organization.create({
      name,
      website,
      slug: workspaceSlug(name, suffix),
    });

    if (data) return data;

    if (error?.code !== "ORGANIZATION_ALREADY_EXISTS") {
      throw new Error(error?.message ?? "Couldn't create the workspace");
    }
  }

  throw new Error("Couldn't find a free workspace URL. Try a different name.");
}

export const createWorkspaceMutation = mutationOptions({
  mutationKey: ["workspaces", "create"],
  mutationFn: createWorkspace,
});

/** Makes another workspace active for this session, then reloads auth state for it. */
export const switchWorkspaceMutation = mutationOptions({
  mutationKey: ["workspaces", "switch"],
  mutationFn: async (workspaceId: string, { client }) => {
    const { error } = await authClient.organization.setActive({ organizationId: workspaceId });

    if (error) throw new Error(error.message ?? "Couldn't switch workspace");

    await Promise.all([resetAuth(client), releaseSynced(workspaceId)]);
  },
});

/**
 * Creates a workspace from inside the app and moves into it: the new workspace becomes active,
 * auth state reloads for it, and the previous workspace's synced data stops.
 */
export const createAndOpenWorkspaceMutation = mutationOptions({
  mutationKey: ["workspaces", "create-and-open"],
  mutationFn: async (value: WorkspaceInput, { client }) => {
    const workspace = await createWorkspace(value);
    const { error } = await authClient.organization.setActive({ organizationId: workspace.id });

    if (error) throw new Error(error.message ?? "Couldn't open the new workspace");

    await Promise.all([resetAuth(client), releaseSynced(workspace.id)]);

    return workspace;
  },
});

/**
 * Renames the active workspace or changes its website. The server re-validates both, and a new
 * website brings its logo; a changed website does not research it again until a member asks.
 */
export const updateWorkspaceMutation = mutationOptions({
  mutationKey: ["workspaces", "update"],
  mutationFn: async (
    { workspaceId, value }: { workspaceId: string; value: WorkspaceInput },
    { client },
  ) => {
    const { error } = await authClient.organization.update({
      organizationId: workspaceId,
      data: toWorkspaceInput(value),
    });

    if (error) throw new Error(error.message ?? "Couldn't save the workspace");

    await resetAuth(client);
  },
});
