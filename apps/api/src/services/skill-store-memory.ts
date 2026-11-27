import type { SkillRecord, SkillStore } from "./Skills.ts";

/**
 * In-process `SkillStore` for tests. `members` lists `<workspace>:<user>` pairs; `names` gives
 * display names for users.
 */
export function createMemorySkillStore(
  members: readonly string[],
  names: Record<string, string> = {},
) {
  const rows: SkillRecord[] = [];
  const memberships = new Set(members);

  const store: SkillStore = {
    isMember: async ({ workspaceId, userId }) => memberships.has(`${workspaceId}:${userId}`),
    list: async (workspaceId) =>
      rows
        .filter((row) => row.workspaceId === workspaceId)
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    find: async (workspaceId, id) =>
      rows.find((row) => row.workspaceId === workspaceId && row.id === id) ?? null,
    insert: async ({ workspaceId, userId }, skill, now) => {
      if (rows.some((row) => row.workspaceId === workspaceId && row.name === skill.name))
        return null;

      const id = `skill_${rows.length + 1}`;

      rows.push({
        id,
        workspaceId,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        files: skill.files,
        source: skill.source,
        sourceId: skill.sourceId,
        enabled: skill.enabled,
        addedBy: { id: userId, name: names[userId] ?? userId },
        createdAt: now,
        updatedAt: now,
      });

      return id;
    },
    setEnabled: async (workspaceId, id, enabled, now) => {
      const index = rows.findIndex((row) => row.workspaceId === workspaceId && row.id === id);
      const row = rows[index];

      if (!row) return false;

      rows[index] = { ...row, enabled, updatedAt: now };

      return true;
    },
    remove: async (workspaceId, id) => {
      const index = rows.findIndex((row) => row.workspaceId === workspaceId && row.id === id);

      if (index === -1) return false;

      rows.splice(index, 1);

      return true;
    },
  };

  return { store, rows };
}
