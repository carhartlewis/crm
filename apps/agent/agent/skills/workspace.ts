import { isConnectionAuthorizationRequiredError } from "eve/connections";
import { defineDynamic, defineSkill } from "eve/skills";
import { agentSkillsUrl, gatewayAuthorization } from "../lib/gateway.ts";
import { loadWorkspaceSkills } from "../lib/workspace-skills.ts";

/**
 * Skills the user's workspace shares (Connections → Skills in the CRM): installed from skills.sh
 * and enabled by a member. Read once per turn. They load after the user has signed the agent in
 * to the CRM, because they use the same token as the connections gateway.
 */
export default defineDynamic(async (ctx) => {
  const user = ctx.session.auth.current;

  if (user?.principalType !== "user" || !ctx.turn) return null;

  const principal = { type: "user", id: user.principalId } as const;

  const skills = await ctx.memo(`workspace-skills:${ctx.turn.id}`, () =>
    loadWorkspaceSkills({
      url: agentSkillsUrl,
      token: async () => {
        try {
          const { token } = await gatewayAuthorization.getToken({
            principal,
            connection: { url: agentSkillsUrl },
          });

          return token;
        } catch (error) {
          if (isConnectionAuthorizationRequiredError(error)) return null;

          throw error;
        }
      },
    }),
  );

  if (skills.length === 0) return null;

  return Object.fromEntries(
    skills.map((skill) => [
      skill.name,
      // A skill without files loads with no sandbox; files install in the sandbox.
      Object.keys(skill.files).length > 0
        ? defineSkill({
            description: skill.description,
            content: skill.content,
            files: skill.files,
          })
        : defineSkill({ description: skill.description, content: skill.content }),
    ]),
  );
});
