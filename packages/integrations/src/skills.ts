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

export const SKILL_DESCRIPTION_MAX = 1024;

/** Form and API rules for a skill written in the CRM. Each returns a message, or undefined. */
export function skillNameError(value: string) {
  if (value.trim() === "") return "Give the skill a name";

  if (!isSkillName(value.trim())) {
    return "Use lowercase letters, numbers and single hyphens, such as deal-review";
  }

  return undefined;
}

export function skillDescriptionError(value: string) {
  if (value.trim() === "") return "Say when the assistant should use it";

  if (value.trim().length > SKILL_DESCRIPTION_MAX) {
    return `Keep it under ${SKILL_DESCRIPTION_MAX} characters`;
  }

  return undefined;
}

export function skillInstructionsError(value: string) {
  if (value.trim() === "") return "Write the instructions";

  if (value.length > SKILL_SIZE_MAX) return "The instructions are too long";

  return undefined;
}

/**
 * Splits YAML frontmatter from a SKILL.md and reads `name` and `description`. Handles plain,
 * quoted and block (`|`, `>`) scalars, which is all SKILL.md frontmatter uses in practice.
 */
export function parseSkillMarkdown(markdown: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);

  if (!match) return { fields: new Map<string, string>(), body: markdown.trim() };

  const lines = (match[1] ?? "").split(/\r?\n/);
  const fields = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index] ?? "");

    if (!field) continue;

    const key = field[1] ?? "";
    let value = (field[2] ?? "").trim();

    if (value === "|" || value === ">" || value === "|-" || value === ">-") {
      const block: string[] = [];

      while (index + 1 < lines.length && /^(\s+|$)/.test(lines[index + 1] ?? "")) {
        index += 1;
        block.push((lines[index] ?? "").trim());
      }

      value = value.startsWith("|") ? block.join("\n").trim() : block.join(" ").trim();
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }

    fields.set(key, value);
  }

  return { fields, body: markdown.slice(match[0].length).trim() };
}
