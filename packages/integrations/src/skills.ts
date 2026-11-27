/**
 * Client-safe rules for workspace skills: instructions the agent loads when they apply, shared
 * by everyone in a workspace. A skill is a SKILL.md (name, description, body) plus optional
 * files. They come from skills.sh (`./skills-sh`) or are written in the CRM.
 */

/** Lowercase letters, digits and single hyphens. The agent loads a skill by this name. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SKILL_NAME_MAX = 64;

/** Most text a skill may carry (SKILL.md and files together), in UTF-16 code units. */
export const SKILL_SIZE_MAX = 1_000_000;

export const SKILL_FILES_MAX = 200;

export type SkillSource = "skills.sh" | "custom";

export function isSkillName(value: string) {
  return value.length <= SKILL_NAME_MAX && SKILL_NAME.test(value);
}

/** Lowercases and replaces anything else with single hyphens: "Deep Research" → "deep-research". */
export function toSkillName(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, "");
}

/** The skill's page on skills.sh, from its id (`owner/repo/skill`). */
export function skillsShUrl(sourceId: string) {
  return `https://skills.sh/${sourceId}`;
}
