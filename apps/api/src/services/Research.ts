import { Context, Effect, Layer, Option, Redacted, Schedule } from "effect";
import type { Pool } from "pg";
import { AppConfig } from "../config.ts";
import { type AgentCaller, startAgentSession } from "./chat-agent.ts";
import { Database } from "./Database.ts";
import { Postgres } from "./Postgres.ts";

/**
 * Research that starts by itself (ADR 0025): when a company, contact or deal is added, the API
 * starts a background agent session about it, in Auto permissions, and the agent fills the record
 * from the web through `crm__` tools. A deal's research is a brief in its memory (ADR 0029). Nobody waits on it: the sheet shows "Researching" and the values
 * arrive through sync. The API only starts the session; the agent judges what is true.
 */

export type ResearchKind = "company" | "contact" | "deal";

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

/**
 * A record that was added but never researched, and the member to research it as. Deals have
 * no research state, so the sweep never retries them (ADR 0029).
 */
export interface PendingRecord {
  readonly kind: Exclude<ResearchKind, "deal">;
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
}

export interface ResearchService {
  /** Starts research on a new record, off the request path. Never fails the caller. */
  readonly start: (actor: ResearchActor, kind: ResearchKind, id: string) => void;
  /**
   * Starts research on records that never got it (the agent was down when they were added).
   * Returns how many started.
   */
  readonly sweep: () => Promise<number>;
  /**
   * Starts a background session that fills one custom field across records; false without a
   * workspace or a known member.
   */
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
  /** Records still `pending` a while after they were added, or stuck `running`, oldest first. */
  readonly pending?: () => Promise<readonly PendingRecord[]>;
}

/** The first message of a research session; the skills hold the steps. */
export const RESEARCH_PROMPTS: Record<ResearchKind, string> = {
  company:
    "This company was just added to the CRM. Research it and fill in its profile, then add its key people as contacts, following your research-company skill. This runs in the background: nobody is watching, so don't ask questions. Fill only what sources say, never overwrite what a member typed with a guess, and mark the research complete, skipped or failed when you finish.",
  contact:
    "This contact was just added to the CRM. Research them and fill in their profile, following your research-contact skill: find their work email, phone number, LinkedIn, title and photo, record each fact you are sure of, and write their background. This runs in the background: nobody is watching, so don't ask questions. Mark the research complete, skipped or failed when you finish.",
  deal: "This deal was just added to the CRM. Research it following your research-deal skill: read the deal, its company, its people and what the CRM already knows, research the buyer's situation that matters to this deal, and save what you find with write_deal_brief. This runs in the background: nobody is watching, so don't ask questions and don't change the deal's stage, amount or close date.",
};

/** How often the sweep looks for records that never got research. */
export const SWEEP_EVERY = "10 minutes";

/** The first message of a "Fill the rest" session. */
export const fillPrompt = (field: FillRequest) =>
  `Fill the custom field "${field.label}" (field id ${field.id}) on every ${field.entity} that has no value for it yet. Read the field and its brief with crm__list_fields, list the records, research each one, and set a value with crm__set_field_value only where a source answers the brief. Leave values members set alone. This runs in the background: nobody is watching, so don't ask questions. Work through them one by one; skip a record you can't answer.`;

export function makeResearch(deps: ResearchDependencies): ResearchService {
  const now = deps.now ?? Date.now;

  /** Starts one Auto session as the member; false without a workspace or a known member. */
  const session = async (
    actor: ResearchActor,
    message: string,
    operationId: string,
    record?: { kind: string; id: string },
  ) => {
    const workspaceId = actor.activeWorkspaceId;

    if (!workspaceId) return false;

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
          origin: "research",
        }
      : {
          id: actor.userId,
          name: user.name,
          email: user.email,
          workspaceId,
          permissionMode: "auto",
          origin: "research",
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
    sweep: async () => {
      const records = (await deps.pending?.()) ?? [];
      let count = 0;

      for (const record of records) {
        const actor = { userId: record.userId, activeWorkspaceId: record.workspaceId };

        // One retry per record per day: eve starts each operation id once.
        const day = new Date(now()).toISOString().slice(0, 10);

        // oxlint-disable-next-line no-await-in-loop -- one at a time, so a sweep can't flood the agent.
        const begun = await session(
          actor,
          RESEARCH_PROMPTS[record.kind],
          `research:${record.id}:${day}`,
          {
            kind: record.kind,
            id: record.id,
          },
        ).catch((cause: unknown) => {
          deps.log(`research sweep: ${record.kind} ${record.id}`, cause);

          return false;
        });

        if (begun) count += 1;
      }

      return count;
    },
    // One fill per field per minute: a second click joins the running one.
    fill: (actor, field) =>
      session(actor, fillPrompt(field), `fill:${field.id}:${Math.floor(now() / 60_000)}`),
  };
}

/** Without the agent's secret there is no agent to ask, and research stays manual. */
const noResearch: ResearchService = {
  start: () => {},
  fill: async () => false,
  sweep: async () => 0,
};

export class Research extends Context.Service<Research, ResearchService>()(
  "@crm/api/services/Research",
) {
  static readonly layer = Layer.effect(
    Research,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const db = yield* Database;
      const pool = yield* Postgres;

      const research = Option.match(config.agentProxySecret, {
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
            pending: () => pendingRecords(pool),
          }),
      });

      // Every record gets researched: the sweep picks up any whose start was missed.
      yield* Effect.promise(() => research.sweep()).pipe(
        Effect.delay("1 minute"),
        Effect.repeat(Schedule.spaced(SWEEP_EVERY)),
        Effect.forkScoped,
      );

      return research;
    }),
  ).pipe(Layer.provide([Database.layer, Postgres.layer]));
}

/**
 * Companies and contacts still `pending` 15 minutes after they were added, or `running` with no
 * change for 30 minutes (the session died, such as when the agent restarted), oldest first, each
 * with the member to research it as: its owner, else the workspace's first owner.
 */
async function pendingRecords(pool: Pool): Promise<readonly PendingRecord[]> {
  const result = await pool.query<{
    kind: PendingRecord["kind"];
    id: string;
    workspace_id: string;
    user_id: string | null;
  }>(
    `SELECT kind, id, workspace_id, coalesce(owner_id, (
              SELECT m."userId" FROM "member" m
               WHERE m."organizationId" = r.workspace_id
               ORDER BY (m.role = 'owner') DESC, m."createdAt" LIMIT 1)) AS user_id
       FROM (
         SELECT 'company' AS kind, id, workspace_id, owner_id, created_at FROM company
          WHERE archived_at IS NULL
            AND ((enrichment_status = 'pending' AND created_at < now() - interval '15 minutes')
              OR (enrichment_status = 'running' AND updated_at < now() - interval '30 minutes'))
         UNION ALL
         SELECT 'contact' AS kind, id, workspace_id, owner_id, created_at FROM contact
          WHERE archived_at IS NULL
            AND ((enrichment_status = 'pending' AND created_at < now() - interval '15 minutes')
              OR (enrichment_status = 'running' AND updated_at < now() - interval '30 minutes'))
       ) r
      ORDER BY created_at
      LIMIT 25`,
  );

  return result.rows.flatMap((row) =>
    row.user_id
      ? [{ kind: row.kind, id: row.id, workspaceId: row.workspace_id, userId: row.user_id }]
      : [],
  );
}
