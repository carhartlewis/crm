/**
 * Synced collections register how to stop syncing here. Session and workspace changes call
 * `releaseSynced` without importing the collections, so TanStack DB and Electric stay out of the
 * cold-entry bundle until a page that uses them loads.
 */
type Release = (keepWorkspaceId?: string) => Promise<void>;

const releases = new Set<Release>();

export function registerSynced(release: Release) {
  releases.add(release);
}

/** Stops syncing other workspaces' data (after a switch), or everything (sign-out: no `keep`). */
export async function releaseSynced(keepWorkspaceId?: string) {
  await Promise.all([...releases].map((release) => release(keepWorkspaceId)));
}
