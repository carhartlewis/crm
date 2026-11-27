import { z } from "zod";
import { parseSkillMarkdown, SKILL_FILES_MAX, SKILL_SIZE_MAX, toSkillName } from "./skills.ts";

export { parseSkillMarkdown };

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

const HOME_URL = "https://skills.sh/";

/**
 * The all-time leaderboard embedded in the skills.sh home page (Next.js flight data, JSON
 * escaped inside a script). skills.sh has no listing API, so this is best effort: entries are
 * validated one by one, and a changed page yields an empty list, never an error.
 */
const LEADERBOARD_ENTRY =
  /\\"source\\":\\"([^"\\]+)\\",\\"skillId\\":\\"([^"\\]+)\\",\\"name\\":\\"([^"\\]+)\\",\\"installs\\":(\d+)/g;

export function parseSkillsShLeaderboard(html: string, limit = 30): readonly SkillsShResult[] {
  const seen = new Set<string>();
  const results: SkillsShResult[] = [];

  for (const [, source = "", skillId = "", name = "", installs = "0"] of html.matchAll(
    LEADERBOARD_ENTRY,
  )) {
    const id = `${source}/${skillId}`;

    if (results.length >= limit) break;

    if (seen.has(id) || !isSkillsShId(id)) continue;

    seen.add(id);
    results.push({ id, name, source, installs: Number(installs) });
  }

  return results;
}

/** The most installed skills on skills.sh. Empty when the page can't be read. */
export async function topSkillsSh({
  fetch: fetchFn = fetch,
  limit = 30,
}: {
  fetch?: Fetch;
  limit?: number;
} = {}): Promise<readonly SkillsShResult[]> {
  try {
    const response = await fetchFn(HOME_URL, { headers: { accept: "text/html" } });

    return response.ok ? parseSkillsShLeaderboard(await response.text(), limit) : [];
  } catch {
    return [];
  }
}
