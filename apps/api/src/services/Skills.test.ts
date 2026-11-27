import { describe, expect, test } from "bun:test";
import type { Fetch } from "@crm/integrations/skills-sh";
import { Effect, Exit } from "effect";
import { createMemorySkillStore } from "./skill-store-memory.ts";
import { makeSkills } from "./Skills.ts";

const alice = { userId: "user_1", activeWorkspaceId: "ws_a" };
const bob = { userId: "user_2", activeWorkspaceId: "ws_a" };
const outsider = { userId: "user_3", activeWorkspaceId: "ws_a" };

const skillMarkdown =
  "---\nname: deep-research\ndescription: Research with sources.\n---\n\nRead first.";

/** skills.sh: one searchable skill, and its package. */
const skillsSh: Fetch = async (url) => {
  const target = new URL(url);

  if (target.pathname === "/api/search") {
    return Response.json({
      skills: [
        {
          id: "acme/skills/deep-research",
          name: "deep-research",
          source: "acme/skills",
          installs: 9,
        },
      ],
    });
  }

  if (target.pathname === "/r/acme/skills/deep-research") {
    return Response.json({
      name: "deep-research",
      files: [
        { path: "SKILL.md", content: skillMarkdown },
        { path: "notes.md", content: "Primary sources." },
      ],
    });
  }

  return new Response(null, { status: 404 });
};

function setup() {
  const memory = createMemorySkillStore(["ws_a:user_1", "ws_a:user_2"], { user_1: "Alice" });

  const skills = makeSkills({
    store: memory.store,
    fetch: skillsSh,
    now: () => new Date("2026-11-27T10:00:00Z"),
  });

  return { skills, memory };
}

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

describe("workspace skills", () => {
  test("installing copies the skill from skills.sh, disabled, for the whole workspace", async () => {
    const { skills } = setup();

    const installed = await run(skills.install(alice, "acme/skills/deep-research"));

    expect(installed).toMatchObject({
      name: "deep-research",
      description: "Research with sources.",
      source: "skills.sh",
      sourceId: "acme/skills/deep-research",
      enabled: false,
      addedBy: { id: "user_1", name: "Alice" },
      fileCount: 1,
    });
    // Another member sees it, with its instructions, before anyone enables it.
    expect((await run(skills.get(bob, installed.id))).content).toBe("Read first.");
  });

  test("the agent gets only enabled skills, and any member can enable one", async () => {
    const { skills } = setup();
    const installed = await run(skills.install(alice, "acme/skills/deep-research"));

    expect(await skills.forAgent({ workspaceId: "ws_a", userId: "user_1" })).toEqual([]);

    await run(skills.setEnabled(bob, installed.id, true));

    expect(await skills.forAgent({ workspaceId: "ws_a", userId: "user_1" })).toEqual([
      {
        name: "deep-research",
        description: "Research with sources.",
        content: "Read first.",
        files: { "notes.md": "Primary sources." },
      },
    ]);
    expect(await skills.forAgent({ workspaceId: "ws_a", userId: "user_3" })).toEqual([]);
  });

  test("discover marks what the workspace already has", async () => {
    const { skills } = setup();

    expect((await run(skills.discover(alice, "research")))[0]?.installed).toBe(false);

    await run(skills.install(alice, "acme/skills/deep-research"));

    expect((await run(skills.discover(alice, "research")))[0]?.installed).toBe(true);
    expect(await run(skills.discover(alice, "r"))).toEqual([]);
  });

  test("refuses non-members, a second copy, unknown ids and bad skills.sh ids", async () => {
    const { skills } = setup();

    await run(skills.install(alice, "acme/skills/deep-research"));

    const failures: readonly Exit.Exit<unknown, unknown>[] = await Promise.all([
      Effect.runPromiseExit(skills.list(outsider)),
      Effect.runPromiseExit(skills.list({ userId: "user_1", activeWorkspaceId: null })),
      Effect.runPromiseExit(skills.install(bob, "acme/skills/deep-research")),
      Effect.runPromiseExit(skills.install(alice, "../../etc/passwd")),
      Effect.runPromiseExit(skills.install(alice, "acme/skills/missing")),
      Effect.runPromiseExit(skills.get(alice, "nope")),
      Effect.runPromiseExit(skills.remove(alice, "nope")),
    ]);

    expect(failures.map((exit) => (Exit.isFailure(exit) ? exit.cause.toString() : "ok"))).toEqual([
      expect.stringContaining("NoActiveWorkspace"),
      expect.stringContaining("NoActiveWorkspace"),
      expect.stringContaining("already has a skill named deep-research"),
      expect.stringContaining("not a skills.sh skill"),
      expect.stringContaining("not on skills.sh"),
      expect.stringContaining("NotFound"),
      expect.stringContaining("NotFound"),
    ]);
  });

  test("removing deletes it for everyone", async () => {
    const { skills } = setup();
    const installed = await run(skills.install(alice, "acme/skills/deep-research"));

    await run(skills.remove(bob, installed.id));

    expect(await run(skills.list(alice))).toEqual([]);
  });
});
