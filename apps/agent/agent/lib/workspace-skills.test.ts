import { describe, expect, test } from "bun:test";
import { loadWorkspaceSkills } from "./workspace-skills.ts";

const url = "http://crm.test/api/agent/skills";

const skill = {
  name: "deep-research",
  description: "Research.",
  content: "Read first.",
  files: {},
};

describe("loadWorkspaceSkills", () => {
  test("sends the gateway token and returns the workspace's skills", async () => {
    const skills = await loadWorkspaceSkills({
      url,
      token: async () => "token-1",
      fetch: async (_url, init) => {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");

        return Response.json([skill]);
      },
    });

    expect(skills).toEqual([skill]);
  });

  test("loads nothing without a token, on an error, or on an unexpected body", async () => {
    let requests = 0;

    const count = async () => {
      requests += 1;

      return Response.json([{ name: 1 }]);
    };

    expect(await loadWorkspaceSkills({ url, token: async () => null, fetch: count })).toEqual([]);
    expect(requests).toBe(0);
    expect(await loadWorkspaceSkills({ url, token: async () => "t", fetch: count })).toEqual([]);
    expect(
      await loadWorkspaceSkills({
        url,
        token: async () => "t",
        fetch: async () => new Response(null, { status: 401 }),
      }),
    ).toEqual([]);
    expect(
      await loadWorkspaceSkills({
        url,
        token: async () => "t",
        fetch: async () => {
          throw new Error("down");
        },
      }),
    ).toEqual([]);
  });
});
