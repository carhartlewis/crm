import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";
import { type AgentCaller, startAgentSession } from "./chat-agent.ts";
import { Database } from "./Database.ts";

/**
 * Research that starts by itself (ADR 0025): when a company or contact is added, the API starts
 * a background agent session about it, in Auto permissions, and the agent fills the record from
 * the web through `crm__` tools. Nobody waits on it: the sheet shows "Researching" and the values
 * arrive through sync. The API only starts the session; the agent judges what is true.
 */

export type ResearchKind = "company" | "contact";

export interface ResearchActor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

/** A custom field to fill on every record that has no value yet ("Fill the rest"). */
export interface FillRequest {
  readonly id: string;
  readonly entity: string;
  readonly label: string;
}

export interface ResearchService {
  /** Starts research on a new record, off the request path. Never fails the caller. */
  readonly start: (actor: ResearchActor, kind: ResearchKind, id: string) => void;
  /** Starts a background session that fills one custom field across records; false at the cap. */
  readonly fill: (actor: ResearchActor, field: FillRequest) => Promise<boolean>;
}

export interface ResearchDependencies {
  /** Starts an agent session with its first message (`startAgentSession`). */
  readonly startSession: (
    caller: AgentCaller,
    message: string,
    operationId: string,
  ) => Promise<void>;
  /** The member's name and email, as the agent's caller headers carry them. */
  readonly user: (userId: string) => Promise<{ name: string; email: string } | null>;
  readonly log: (message: string, cause: unknown) => void;
  readonly now?: () => number;
}

/** Research runs one workspace may start in a window, so a bulk import can't flood the agent. */
export const RESEARCH_LIMIT = 30;

export const RESEARCH_WINDOW_MS = 10 * 60 * 1000;

/** The first message of a research session; the skills hold the steps. */
export const RESEARCH_PROMPTS: Record<ResearchKind, string> = {
  company:
    "This company was just added to the CRM. Research it on the web and fill in its profile, following your research-company skill. This runs in the background: nobody is watching, so don't ask questions. Fill only what sources say, never overwrite what a member typed with a guess, and mark the research complete, skipped or failed when you finish.",
  contact:
    "This contact was just added to the CRM. Research them and fill in their profile, following your research-contact skill: start with crm__lookup_person, record each fact you are sure of (including their photo), and write their background. This runs in the background: nobody is watching, so don't ask questions. Mark the research complete, skipped or failed when you finish.",
};

/** The first message of a "Fill the rest" session. */
export const fillPrompt = (field: FillRequest) =>
  `Fill the custom field "${field.label}" (field id ${field.id}) on every ${field.entity} that has no value for it yet. Read the field and its brief with crm__list_fields, list the records, research each one, and set a value with crm__set_field_value only where a source answers the brief. Leave values members set alone. This runs in the background: nobody is watching, so don't ask questions. Work through them one by one; skip a record you can't answer.`;

export function makeResearch(deps: ResearchDependencies): ResearchService {
  const now = deps.now ?? Date.now;
  const started = new Map<string, number[]>();

  /** Whether the workspace is under its limit; counts this run when it is. */
  const admit = (workspaceId: string) => {
    const at = now();

    const recent = (started.get(workspaceId) ?? []).filter(
      (time) => at - time < RESEARCH_WINDOW_MS,
    );

    if (recent.length >= RESEARCH_LIMIT) return false;

    started.set(workspaceId, [...recent, at]);

    return true;
  };

  /** Starts one Auto session as the member; false when the workspace is at its cap. */
  const session = async (
    actor: ResearchActor,
    message: string,
    operationId: string,
    record?: { kind: string; id: string },
  ) => {
    const workspaceId = actor.activeWorkspaceId;

    if (!workspaceId || !admit(workspaceId)) return false;

    const user = await deps.user(actor.userId);

    if (!user) return false;

    const caller: AgentCaller = record
      ? {
          id: actor.userId,
          name: user.name,
          email: user.email,
          workspaceId,
          permissionMode: "auto",
          record,
        }
      : {
          id: actor.userId,
          name: user.name,
          email: user.email,
          workspaceId,
          permissionMode: "auto",
        };

    await deps.startSession(caller, message, operationId);

    return true;
  };

  return {
    start: (actor, kind, id) => {
      session(actor, RESEARCH_PROMPTS[kind], `research:${id}`, { kind, id }).catch(
        (cause: unknown) => deps.log(`research: ${kind} ${id}`, cause),
      );
    },
    // One fill per field per minute: a second click joins the running one.
    fill: (actor, field) =>
      session(actor, fillPrompt(field), `fill:${field.id}:${Math.floor(now() / 60_000)}`),
  };
}

/** Without the agent's secret there is no agent to ask, and research stays manual. */
const noResearch: ResearchService = { start: () => {}, fill: async () => false };

export class Research extends Context.Service<Research, ResearchService>()(
  "@crm/api/services/Research",
) {
  static readonly layer = Layer.effect(
    Research,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const db = yield* Database;

      return Option.match(config.agentProxySecret, {
        onNone: () => noResearch,
        onSome: (secret) =>
          makeResearch({
            startSession: (caller, message, operationId) =>
              startAgentSession(
                config.agentUrl,
                Redacted.value(secret),
                caller,
                message,
                operationId,
              ),
            user: async (userId) => {
              const row = await db.orm.public.User.where({ id: userId }).first();

              return row ? { name: row.name, email: row.email } : null;
            },
            log: (message, cause) => void Effect.runFork(Effect.logWarning(message, cause)),
          }),
      });
    }),
  ).pipe(Layer.provide(Database.layer));
}
