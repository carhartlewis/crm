import { Option, Schema } from "effect";

/**
 * Reads the workspace's enabled skills from the CRM (`GET /api/agent/skills`), with the user's
 * gateway token. Returns none when the user has not signed the agent in to the CRM yet, or when
 * the CRM can't be reached: skills are extra guidance, so a failure never blocks a turn.
 */
const AgentSkills = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    content: Schema.String,
    files: Schema.Record(Schema.String, Schema.String),
  }),
);

export type AgentSkills = typeof AgentSkills.Type;

const decode = Schema.decodeUnknownOption(AgentSkills);

export interface WorkspaceSkillsOptions {
  readonly url: string;
  /** The user's gateway token, or null when there is none. Must never start a sign-in. */
  readonly token: () => Promise<string | null>;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function loadWorkspaceSkills(options: WorkspaceSkillsOptions): Promise<AgentSkills> {
  const token = await options.token();

  if (!token) return [];

  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });

    if (!response.ok) return [];

    return Option.getOrElse(decode(await response.json()), () => []);
  } catch {
    return [];
  }
}
