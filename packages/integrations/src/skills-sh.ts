import { z } from "zod";
import { SKILL_FILES_MAX, SKILL_SIZE_MAX, toSkillName } from "./skills.ts";

/**
 * Server-only client for skills.sh, the public skills directory. Search returns ids; a skill's
 * id (`owner/repo/skill`, or `domain/skill`) fetches its whole package as a shadcn registry item.
 * Both responses are validated, and a fetched skill is checked against the size limits before
 * anyone can store it.
 */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface SkillsShResult {
  /** The skills.sh id, such as `vercel-labs/agent-skills/vercel-react-best-practices`. */
  readonly id: string;
  readonly name: string;
  /** Where it comes from, such as `vercel-labs/agent-skills`. */
  readonly source: string;
  readonly installs: number;
}

/** A skill package, ready to store. */
export interface SkillPackage {
  readonly name: string;
  readonly description: string;
  /** The SKILL.md body without its frontmatter. */
  readonly content: string;
  /** Every other file, by path relative to the skill. */
  readonly files: Readonly<Record<string, string>>;
}

export class SkillsShError extends Error {
  override readonly name = "SkillsShError";
}

const SEARCH_URL = "https://skills.sh/api/search";
const ITEM_URL = "https://www.skills.sh/r";

/** Two or three path segments of letters, digits, `.`, `_` and `-`. */
const SKILL_ID = /^[\w.-]+(?:\/[\w.-]+){1,2}$/;

export function isSkillsShId(value: string) {
  return SKILL_ID.test(value) && !value.split("/").some((part) => part === "." || part === "..");
}

const SearchResponse = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: z.string(),
      installs: z.number().catch(0),
    }),
  ),
});

const RegistryItem = z.object({
  name: z.string(),
  description: z.string().optional(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});

export async function searchSkillsSh(
  query: string,
  { fetch: fetchFn = fetch, limit = 20 }: { fetch?: Fetch; limit?: number } = {},
): Promise<readonly SkillsShResult[]> {
  const url = new URL(SEARCH_URL);

  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const response = await fetchFn(url.href, { headers: { accept: "application/json" } });

  if (!response.ok) throw new SkillsShError(`skills.sh search failed (${response.status})`);

  const parsed = SearchResponse.safeParse(await response.json());

  if (!parsed.success) throw new SkillsShError("skills.sh sent an unexpected search response");

  return parsed.data.skills.filter((skill) => isSkillsShId(skill.id));
}

/** A relative path inside the skill: no leading `/`, no `.` or `..` segments, no backslashes. */
function isSafePath(path: string) {
  return (
    path !== "" &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
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

/** Fetches a skill's package from skills.sh and checks it against the limits. */
export async function fetchSkillsShSkill(
  id: string,
  { fetch: fetchFn = fetch }: { fetch?: Fetch } = {},
): Promise<SkillPackage> {
  if (!isSkillsShId(id)) throw new SkillsShError("Not a skills.sh skill id");

  const response = await fetchFn(`${ITEM_URL}/${id}?agent=eve`, {
    headers: { accept: "application/json" },
  });

  if (response.status === 404) throw new SkillsShError("That skill is not on skills.sh");

  if (!response.ok) throw new SkillsShError(`skills.sh failed (${response.status})`);

  const parsed = RegistryItem.safeParse(await response.json());

  if (!parsed.success) throw new SkillsShError("skills.sh sent an unexpected skill");

  const item = parsed.data;
  const skillFile = item.files.find((file) => file.path === "SKILL.md");

  if (!skillFile) throw new SkillsShError("The skill has no SKILL.md");

  const others = item.files.filter((file) => file.path !== "SKILL.md");

  if (others.length > SKILL_FILES_MAX) throw new SkillsShError("The skill has too many files");

  if (!others.every((file) => isSafePath(file.path))) {
    throw new SkillsShError("The skill has a file outside its folder");
  }

  const size = item.files.reduce((total, file) => total + file.content.length, 0);

  if (size > SKILL_SIZE_MAX) throw new SkillsShError("The skill is too large");

  const { fields, body } = parseSkillMarkdown(skillFile.content);
  const name = toSkillName(fields.get("name") ?? item.name);
  const description = fields.get("description") ?? item.description ?? "";

  if (name === "" || description === "" || body === "") {
    throw new SkillsShError("The skill has no name, description or instructions");
  }

  return {
    name,
    description,
    content: body,
    files: Object.fromEntries(others.map((file) => [file.path, file.content])),
  };
}
