import { describe, expect, test } from "bun:test";
import { isSkillName, toSkillName } from "./skills.ts";
import {
  parseSkillsShLeaderboard,
  fetchSkillsShSkill,
  isSkillsShId,
  parseSkillMarkdown,
  searchSkillsSh,
  type Fetch,
} from "./skills-sh.ts";

const skillMarkdown = `---
name: deep-research
description: >
  Research a topic across many sources
  and write a cited brief.
license: MIT
---

# Deep research

Search first, then read.
`;

function registry(files: { path: string; content: string }[], status = 200): Fetch {
  return async () =>
    Response.json({ name: "deep-research", description: "From the item", files }, { status });
}

describe("parseSkillMarkdown", () => {
  test("reads folded, literal and quoted values, and returns the body", () => {
    const { fields, body } = parseSkillMarkdown(skillMarkdown);

    expect(fields.get("name")).toBe("deep-research");
    expect(fields.get("description")).toBe(
      "Research a topic across many sources and write a cited brief.",
    );
    expect(body).toBe("# Deep research\n\nSearch first, then read.");
    expect(
      parseSkillMarkdown('---\ndescription: "Quoted: yes"\n---\nx').fields.get("description"),
    ).toBe("Quoted: yes");
    expect(parseSkillMarkdown("---\nnotes: |\n  a\n  b\n---\nx").fields.get("notes")).toBe("a\nb");
  });

  test("treats a file without frontmatter as all body", () => {
    expect(parseSkillMarkdown("Just text.\n")).toEqual({ fields: new Map(), body: "Just text." });
  });
});

describe("fetchSkillsShSkill", () => {
  test("returns the package with SKILL.md split from the other files", async () => {
    const skill = await fetchSkillsShSkill("acme/skills/deep-research", {
      fetch: registry([
        { path: "SKILL.md", content: skillMarkdown },
        { path: "references/sources.md", content: "Use primary sources." },
      ]),
    });

    expect(skill).toEqual({
      name: "deep-research",
      description: "Research a topic across many sources and write a cited brief.",
      content: "# Deep research\n\nSearch first, then read.",
      files: { "references/sources.md": "Use primary sources." },
    });
  });

  test("refuses ids that are not skills.sh ids, before any request", async () => {
    let requests = 0;

    const fetch: Fetch = async () => {
      requests += 1;

      return new Response();
    };

    await expect(fetchSkillsShSkill("../../etc", { fetch })).rejects.toThrow();
    await expect(fetchSkillsShSkill("https://evil.test/x", { fetch })).rejects.toThrow();
    expect(requests).toBe(0);
  });

  test("refuses files that escape the skill folder, oversized skills and missing SKILL.md", async () => {
    const escape = registry([
      { path: "SKILL.md", content: skillMarkdown },
      { path: "../outside.md", content: "x" },
    ]);

    const huge = registry([{ path: "SKILL.md", content: skillMarkdown + "x".repeat(1_000_001) }]);
    const empty = registry([{ path: "README.md", content: "x" }]);

    await expect(fetchSkillsShSkill("a/b/c", { fetch: escape })).rejects.toThrow("outside");
    await expect(fetchSkillsShSkill("a/b/c", { fetch: huge })).rejects.toThrow("too large");
    await expect(fetchSkillsShSkill("a/b/c", { fetch: empty })).rejects.toThrow("SKILL.md");
  });
});

/** skills.sh search: one good result and one malformed id. */
const searchResults: Fetch = async (url) => {
  expect(new URL(url).searchParams.get("q")).toBe("research");

  return Response.json({
    skills: [
      {
        id: "acme/skills/deep-research",
        name: "deep-research",
        source: "acme/skills",
        installs: 12,
      },
      { id: "../bad", name: "bad", source: "x", installs: 1 },
    ],
  });
};

describe("searchSkillsSh", () => {
  test("returns validated results and drops malformed ids", async () => {
    expect(await searchSkillsSh("research", { fetch: searchResults })).toEqual([
      {
        id: "acme/skills/deep-research",
        name: "deep-research",
        source: "acme/skills",
        installs: 12,
      },
    ]);
  });
});

describe("names and ids", () => {
  test("skill names", () => {
    expect(toSkillName("Deep Research!")).toBe("deep-research");
    expect(isSkillName("deep-research")).toBe(true);
    expect(isSkillName("Deep")).toBe(false);
    expect(isSkillName("a--b")).toBe(false);
  });

  test("skills.sh ids", () => {
    expect(isSkillsShId("vercel-labs/agent-skills/vercel-react-best-practices")).toBe(true);
    expect(isSkillsShId("open.feishu.cn/lark-event")).toBe(true);
    expect(isSkillsShId("single")).toBe(false);
    expect(isSkillsShId("a/../b")).toBe(false);
  });
});

/** One leaderboard entry as the page embeds it (JSON escaped inside a script). */
const entry = (source: string, skillId: string, installs: number) =>
  `{\\"source\\":\\"${source}\\",\\"skillId\\":\\"${skillId}\\",\\"name\\":\\"${skillId}\\",\\"installs\\":${installs}}`;

describe("parseSkillsShLeaderboard", () => {
  test("reads ranked entries from the page, once each, up to the limit", () => {
    const html = `<script>self.__next_f.push([1,"{\\"initialSkills\\":[${[
      entry("vercel-labs/skills", "find-skills", 4558137),
      entry("acme/skills", "deep-research", 12),
      entry("vercel-labs/skills", "find-skills", 4558137),
      entry("acme/skills", "notes", 3),
    ].join(",")}]}"])</script>`;

    expect(parseSkillsShLeaderboard(html, 2)).toEqual([
      {
        id: "vercel-labs/skills/find-skills",
        name: "find-skills",
        source: "vercel-labs/skills",
        installs: 4558137,
      },
      {
        id: "acme/skills/deep-research",
        name: "deep-research",
        source: "acme/skills",
        installs: 12,
      },
    ]);
  });

  test("returns nothing when the page changes", () => {
    expect(parseSkillsShLeaderboard("<html>new design</html>")).toEqual([]);
  });
});
