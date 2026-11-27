/**
 * A command typed in the composer as `/name`, as in T3 Code: a mode, a session control, or a
 * workspace skill. Text after the name (`/plan add Mercury`) goes with it.
 */
export interface SlashCommand {
  /** Without the slash: `plan`, `compact`, `seo-audit`. */
  readonly name: string;
  readonly description: string;
  /** Runs it with the text typed after the name, trimmed (often empty). */
  readonly run: (rest: string) => void;
  /** Picking it from the menu waits for text (a skill); others run at once. */
  readonly takesText?: boolean;
}

export interface TypedCommand {
  readonly name: string;
  readonly rest: string;
}

/** `/plan add Mercury` → `{ name: "plan", rest: "add Mercury" }`; text without a slash → null. */
export function parseSlash(text: string): TypedCommand | null {
  const match = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());

  if (!match?.[1]) return null;

  return { name: match[1].toLowerCase(), rest: (match[2] ?? "").trim() };
}

/** The query the menu filters by while only `/name` is typed, or null when it should be closed. */
export function slashQuery(text: string): string | null {
  const match = /^\/([\w:.-]*)$/.exec(text);

  return match ? (match[1] ?? "").toLowerCase() : null;
}

/** From this length on, a query also matches what a command does, not only its name. */
const DESCRIPTION_MATCH_LENGTH = 3;

/**
 * Commands for a query: names that start with it, then names that hold it, then (for three
 * letters or more) commands whose description holds it.
 */
export function matchCommands(
  query: string,
  commands: readonly SlashCommand[],
): readonly SlashCommand[] {
  const starts = commands.filter((command) => command.name.startsWith(query));

  const holds = commands.filter(
    (command) => !command.name.startsWith(query) && command.name.includes(query),
  );

  const describes =
    query.length < DESCRIPTION_MATCH_LENGTH
      ? []
      : commands.filter(
          (command) =>
            !command.name.includes(query) && command.description.toLowerCase().includes(query),
        );

  return [...starts, ...holds, ...describes];
}

/** The command a submitted message names, if it is one of `commands`. */
export function commandFor(text: string, commands: readonly SlashCommand[]) {
  const typed = parseSlash(text);
  const command = typed && commands.find((item) => item.name === typed.name);

  return command && typed ? { command, rest: typed.rest } : null;
}

/** A skill's command name: `SEO Audit` → `seo-audit`. */
export function skillCommandName(skillName: string) {
  return skillName
    .toLowerCase()
    .replaceAll(/[^\w:.-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/** What `/seo-audit acme.com` sends: the skill by name, then the request. */
export function skillMessage(skillName: string, rest: string) {
  return rest ? `Use the "${skillName}" skill: ${rest}` : `Use the "${skillName}" skill.`;
}
