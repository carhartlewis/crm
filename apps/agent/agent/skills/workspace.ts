import { defineDynamic, defineSkill } from "eve/skills";
import { crmCaller, crmToken } from "../lib/crm-token.ts";
import { agentSkillsUrl } from "../lib/gateway.ts";
import { loadWorkspaceSkills } from "../lib/workspace-skills.ts";

/**
 * Skills the workspace shares (Workspace settings → Workspace Skills): installed from skills.sh
 * and enabled by a member. Read once per turn. A chat from the CRM loads its workspace's skills
 * at once (a signed agent token, ADR 0018); other callers once they signed the agent in to the
 * CRM, with the same token as the connections gateway.
 */
export default defineDynamic(async (ctx) => {
  const caller = crmCaller(ctx.session.auth.current);

  if (!caller || !ctx.turn) return null;

  const skills = await ctx.memo(`workspace-skills:${ctx.turn.id}`, () =>
    loadWorkspaceSkills({ url: agentSkillsUrl, token: () => crmToken(caller) }),
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
