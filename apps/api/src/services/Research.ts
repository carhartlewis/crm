import { Context, Effect, Layer, Option, Redacted, Schedule } from "effect";
import type { Pool } from "pg";
import { AppConfig } from "../config.ts";
import { type AgentCaller, startAgentSession } from "./chat-agent.ts";
import { Database } from "./Database.ts";
import { Postgres } from "./Postgres.ts";
import {
  DEFAULT_LIMITS,
  type QueueLimits,
  type ResearchJob,
  runResearchJob,
  type SessionEnds,
  type WorkspaceSlots,
} from "./research-queue.ts";
import {
  createRedisEnds,
  createRedisSlots,
  createResearchQueue,
  type ResearchQueue,
  startResearchWorker,
} from "./research-bullmq.ts";
import { RedisClient } from "bun";

/**
 * Research that starts by itself (ADR 0025): when a company, contact or deal is added, the API
 * queues a background agent session about it, in Auto permissions, and the agent fills the record
 * from the web through `crm__` tools. A deal's research is a brief in its memory (ADR 0029).
 * Sessions wait in the research queue (ADR 0030) until their workspace and the API have room.
 * Nobody waits on it: the record shows "Research queued", then "Researching", and the values
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
  /** Queues research on a new record, off the request path. Never fails the caller. */
  readonly start: (actor: ResearchActor, kind: ResearchKind, id: string) => void;
  /**
   * Queues research on records that never got it (the agent was down, or a session died).
   * Returns how many were queued; a record already queued or running is left alone.
   */
  readonly sweep: () => Promise<number>;
  /**
   * Queues a background session that fills one custom field across records; false without a
   * workspace or a known member.
   */
  readonly fill: (actor: ResearchActor, field: FillRequest) => Promise<boolean>;
  /** A research session ended (the agent's hook): its slot goes to the next job. */
  readonly finished: (workspaceId: string, jobId: string) => Promise<void>;
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
  readonly log: (message: string, cause?: unknown) => void;
  readonly now?: () => number;
  /** Records still `pending` a while after they were added, or stuck `running`, oldest first. */
  readonly pending?: () => Promise<readonly PendingRecord[]>;
  /** Where jobs wait their turn (ADR 0030): BullMQ in the API. */
  readonly queue: ResearchQueue;
  /** Each workspace's running sessions. */
  readonly slots: WorkspaceSlots;
  /** Word that a session ended, from the agent's hook. */
  readonly ends: SessionEnds;
  readonly limits?: QueueLimits;
  /**
   * Its session is starting: marks a company or contact `running`, which Electric syncs to every
   * open table at once. False when the record is gone, archived or already researched.
   */
  readonly claim?: (job: ResearchJob & { kind: "company" | "contact" }) => Promise<boolean>;
  /** Its session could not start: back to `pending`, so the sweep tries again. */
  readonly unclaim?: (job: ResearchJob & { kind: "company" | "contact" }) => Promise<void>;
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

/** The job id of a record's research: one at a time per record. */
export const researchJobId = (recordId: string) => `research-${recordId}`;

const statusKind = (
  job: ResearchJob,
): job is ResearchJob & { kind: "company" | "contact"; recordId: string } =>
  (job.kind === "company" || job.kind === "contact") && job.recordId !== null;

/** The first message of a job's session; null for a fill that lost its field. */
function messageOf(job: ResearchJob) {
  if (job.kind !== "fill") return RESEARCH_PROMPTS[job.kind];

  return job.field ? fillPrompt(job.field) : null;
}

/** A record's research job; `operationId` differs for a retry, the job id never does. */
function recordJob(
  workspaceId: string,
  userId: string,
  kind: ResearchKind,
  id: string,
  operationId: string,
): ResearchJob {
  return {
    id: researchJobId(id),
    workspaceId,
    userId,
    kind,
    recordId: id,
    field: null,
    operationId,
  };
}

export function makeResearch(deps: ResearchDependencies): ResearchService & {
  /** Runs one job, as BullMQ's worker calls it: `busy` when its workspace is full. */
  readonly run: (job: ResearchJob) => Promise<"busy" | "done">;
} {
  const now = deps.now ?? Date.now;

  /** Starts one job's Auto session as its member; false when there is nothing to start. */
  const begin = async (job: ResearchJob) => {
    const user = await deps.user(job.userId);

    if (!user) return false;

    if (statusKind(job) && deps.claim && !(await deps.claim(job))) return false;

    const message = messageOf(job);

    if (!message) return false;

    let caller: AgentCaller = {
      id: job.userId,
      name: user.name,
      email: user.email,
      workspaceId: job.workspaceId,
      permissionMode: "auto",
      origin: "research",
      researchJob: job.id,
    };

    if (job.kind !== "fill" && job.recordId) {
      caller = { ...caller, record: { kind: job.kind, id: job.recordId } };
    }

    try {
      await deps.startSession(caller, message, job.operationId);
    } catch (cause) {
      if (statusKind(job)) await deps.unclaim?.(job);

      throw cause;
    }

    return true;
  };

  const limits = deps.limits ?? DEFAULT_LIMITS;
  const { queue } = deps;

  return {
    start: (actor, kind, id) => {
      if (!actor.activeWorkspaceId) return;

      queue
        .enqueue(recordJob(actor.activeWorkspaceId, actor.userId, kind, id, `research:${id}`))
        .catch((cause: unknown) => deps.log(`research: ${kind} ${id}`, cause));
    },
    sweep: async () => {
      const records = (await deps.pending?.()) ?? [];
      // One retry per record per day: eve starts each operation id once.
      const day = new Date(now()).toISOString().slice(0, 10);
      let count = 0;

      for (const record of records) {
        // oxlint-disable-next-line no-await-in-loop -- in order, so the oldest queue first.
        const queued = await queue.enqueue(
          recordJob(
            record.workspaceId,
            record.userId,
            record.kind,
            record.id,
            `research:${record.id}:${day}`,
          ),
        );

        if (queued) count += 1;
      }

      return count;
    },
    fill: async (actor, field) => {
      const workspaceId = actor.activeWorkspaceId;

      if (!workspaceId || !(await deps.user(actor.userId))) return false;

      // One fill per field per minute: a second click joins the queued or running one.
      const id = `fill-${field.id}-${Math.floor(now() / 60_000)}`;

      await queue.enqueue({
        id,
        workspaceId,
        userId: actor.userId,
        kind: "fill",
        recordId: null,
        field: { id: field.id, entity: field.entity, label: field.label },
        operationId: id,
      });

      return true;
    },
    finished: async (workspaceId, jobId) => {
      // Only a job running in the caller's workspace can be ended.
      if (await deps.slots.holds(workspaceId, jobId)) await deps.ends.end(jobId);
    },
    run: (job) =>
      runResearchJob(job, {
        slots: deps.slots,
        ends: deps.ends,
        limits,
        now,
        begin,
        log: deps.log,
      }),
  };
}

/** Research problems go to the API's log as warnings; research never fails a request. */
const log = (message: string, cause?: unknown) =>
  void Effect.runFork(Effect.logWarning(message, cause));

/** Without the agent's secret there is no agent to ask, and research stays manual. */
const noResearch: ResearchService = {
  start: () => {},
  fill: async () => false,
  sweep: async () => 0,
  finished: async () => {},
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

      if (Option.isNone(config.agentProxySecret)) return noResearch;

      const secret = Redacted.value(config.agentProxySecret.value);
      const redisUrl = Redacted.value(config.redisUrl);

      const limits: QueueLimits = {
        workspace: {
          company: config.researchCompanyConcurrency,
          contact: config.researchContactConcurrency,
          deal: config.researchDealConcurrency,
          fill: config.researchFillConcurrency,
        },
        global: config.researchConcurrency,
        leaseMs: DEFAULT_LIMITS.leaseMs,
      };

      const redis = yield* Effect.acquireRelease(
        Effect.sync(() => new RedisClient(redisUrl)),
        (client) => Effect.sync(() => client.close()),
      );

      const { research: queue, queue: bull } = yield* Effect.acquireRelease(
        Effect.sync(() => createResearchQueue(redisUrl)),
        ({ queue: open }) => Effect.promise(() => open.close()),
      );

      const research = makeResearch({
        startSession: (caller, message, operationId) =>
          startAgentSession(config.agentUrl, secret, caller, message, operationId),
        user: async (userId) => {
          const row = await db.orm.public.User.where({ id: userId }).first();

          return row ? { name: row.name, email: row.email } : null;
        },
        log,
        pending: () => pendingRecords(pool),
        queue,
        slots: createRedisSlots(redis),
        ends: createRedisEnds(redis),
        limits,
        claim: (job) => claimRecord(pool, job),
        unclaim: (job) => unclaimRecord(pool, job),
      });

      // The worker runs jobs as slots free up; closing it lets running jobs finish first.
      yield* Effect.acquireRelease(
        Effect.promise(() => startResearchWorker(redisUrl, bull, limits, research.run, log)),
        (worker) => Effect.promise(() => worker.close()),
      );

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
 * with the member to research it as: its owner, else the workspace's first owner. Records still
 * waiting in the queue come back too; the queue already holds them and leaves them alone.
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
      LIMIT 500`,
  );

  return result.rows.flatMap((row) =>
    row.user_id
      ? [{ kind: row.kind, id: row.id, workspaceId: row.workspace_id, userId: row.user_id }]
      : [],
  );
}

/** Table of a company or contact job; the job's kind is checked, so this is never user text. */
const TABLES = { company: "company", contact: "contact" } as const;

/**
 * Its session is starting: `running`, unless the record is gone, archived, or no longer waiting
 * (a member re-ran research, or it finished). Electric syncs the change to every open table.
 */
async function claimRecord(pool: Pool, job: ResearchJob & { kind: "company" | "contact" }) {
  const result = await pool.query(
    `UPDATE ${TABLES[job.kind]} SET enrichment_status = 'running', enrichment_error = NULL,
            updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
        AND enrichment_status IN ('pending', 'running')`,
    [job.recordId, job.workspaceId],
  );

  return (result.rowCount ?? 0) > 0;
}

/** Its session could not start: back to `pending`, which the sweep retries. */
async function unclaimRecord(pool: Pool, job: ResearchJob & { kind: "company" | "contact" }) {
  await pool.query(
    `UPDATE ${TABLES[job.kind]} SET enrichment_status = 'pending', updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND enrichment_status = 'running'`,
    [job.recordId, job.workspaceId],
  );
}
