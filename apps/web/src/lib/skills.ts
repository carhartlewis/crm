import type { SkillDetail, SkillsShResult } from "@crm/core/api";
import { SKILLS_SYNC_PATH } from "@crm/core/api";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { request } from "./api-fetch.ts";
import { isoTimestamp, perWorkspace, syncedWrite } from "./sync-collections.ts";

/**
 * Workspace skills sync from Postgres through Electric (ADR 0012): lists, filters and the skill
 * sheet read locally, and a change by another member shows up on its own. A skill's extra files
 * (up to 1 MB) stay on the server and load when the sheet opens; skills.sh search is a request.
 */

/**
 * A skill as Electric syncs it, without its files. A type alias, not an interface: TanStack DB
 * rows need an implicit index signature.
 */
export type Skill = {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly description: string;
  /** The SKILL.md body. */
  readonly content: string;
  readonly source: "skills.sh" | "custom";
  /** The skills.sh id the copy was made from; null for custom skills. */
  readonly source_id: string | null;
  readonly enabled: boolean;
  readonly added_by_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

const createSkills = (workspaceId: string) =>
  createCollection(
    electricCollectionOptions<Skill>({
      id: `skills:${workspaceId}`,
      getKey: (skill) => skill.id,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- TanStack DB's option name (an Electric "shape").
      shapeOptions: {
        url: new URL(SKILLS_SYNC_PATH, window.location.origin).href,
        params: { workspace: workspaceId },
        parser: { timestamptz: isoTimestamp },
      },
      // Adding a skill is not optimistic: the API validates it, or copies it from skills.sh (see
      // the mutations below). Enabling and removing are, until their txid arrives.
      onUpdate: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original, changes }) =>
            syncedWrite(`/api/skills/${encodeURIComponent(original.id)}`, "PATCH", {
              enabled: changes.enabled ?? original.enabled,
            }),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
      onDelete: async ({ transaction, collection }) => {
        const writes = await Promise.all(
          transaction.mutations.map(({ original }) =>
            syncedWrite(`/api/skills/${encodeURIComponent(original.id)}`, "DELETE"),
          ),
        );

        await Promise.all(writes.map(({ txid }) => collection.utils.awaitTxId(txid)));
      },
    }),
  );

export type SkillsCollection = ReturnType<typeof createSkills>;

/** The workspace's synced skills. */
export const skillsCollection = perWorkspace(createSkills);

/** Requests that are not synced; the user is in the key so one account's cache never serves another. */
export const skillKeys = {
  all: ["skills"] as const,
  list: (userId: string, workspaceId: string) => [...skillKeys.all, userId, workspaceId] as const,
  detail: (userId: string, workspaceId: string, id: string) =>
    [...skillKeys.list(userId, workspaceId), id] as const,
  discover: (userId: string, workspaceId: string, query: string) =>
    [...skillKeys.list(userId, workspaceId), "discover", query] as const,
};

/** A skill with its file list, for the sheet's file count (the rest comes from sync). */
export const skillQuery = (userId: string, workspaceId: string, id: string) =>
  queryOptions({
    queryKey: skillKeys.detail(userId, workspaceId, id),
    queryFn: () => request<SkillDetail>(`/api/skills/${encodeURIComponent(id)}`),
  });

/** Skills to add: the most installed ones, or search results. Fresh for a minute. */
export const discoverQuery = (userId: string, workspaceId: string, query: string) =>
  queryOptions({
    queryKey: skillKeys.discover(userId, workspaceId, query),
    queryFn: () =>
      request<readonly SkillsShResult[]>(`/api/skills/discover?q=${encodeURIComponent(query)}`),
    staleTime: 60_000,
  });

/** Settles once the new skill has synced back, so it can be opened at once; returns its id. */
async function added(collection: SkillsCollection, write: Promise<{ txid: number; id?: string }>) {
  const { txid, id } = await write;

  await collection.utils.awaitTxId(txid);

  if (!id) throw new Error("The server returned no skill id");

  return id;
}

/** A skill written (or uploaded) in the CRM. It starts enabled: its author has read it. */
export const createSkillMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "create"],
  mutationFn: ({
    collection,
    skill,
  }: {
    collection: SkillsCollection;
    skill: { name: string; description: string; content: string };
  }) => added(collection, syncedWrite("/api/skills", "POST", skill)),
});

/** Copies a skill from skills.sh into the workspace, off until someone reads and enables it. */
export const installSkillMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "install"],
  mutationFn: ({ collection, sourceId }: { collection: SkillsCollection; sourceId: string }) =>
    added(collection, syncedWrite("/api/skills/install", "POST", { sourceId })),
});

export const setSkillEnabledMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "enabled"],
  mutationFn: async ({
    collection,
    id,
    enabled,
  }: {
    collection: SkillsCollection;
    id: string;
    enabled: boolean;
  }) => {
    await collection
      .update(id, (draft) => {
        draft.enabled = enabled;
      })
      .when("settled");
  },
});

export const removeSkillMutation = mutationOptions({
  mutationKey: [...skillKeys.all, "remove"],
  mutationFn: async ({ collection, id }: { collection: SkillsCollection; id: string }) => {
    await collection.delete(id).when("settled");
  },
});

/** A skill as the list and sheet show it: the synced row, with who added it by name. */
export interface SkillItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly source: "skills.sh" | "custom";
  readonly sourceId: string | null;
  readonly enabled: boolean;
  readonly addedBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Synced rows with authors' names from the workspace's members (`workspaceQuery`). An author
 * who has left the workspace shows without a name.
 */
export function toSkillItem(skill: Skill, names: ReadonlyMap<string, string>): SkillItem {
  const authorName = skill.added_by_id === null ? undefined : names.get(skill.added_by_id);

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: skill.source,
    sourceId: skill.source_id,
    enabled: skill.enabled,
    addedBy:
      skill.added_by_id === null || authorName === undefined
        ? null
        : { id: skill.added_by_id, name: authorName },
    createdAt: skill.created_at,
    updatedAt: skill.updated_at,
  };
}
