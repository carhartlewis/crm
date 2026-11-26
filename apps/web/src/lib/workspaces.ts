import { mutationOptions } from "@tanstack/react-query";
import { toWorkspaceInput, workspaceSlug, type WorkspaceInput } from "@crm/core/workspace";
import { authClient } from "./auth.ts";

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
