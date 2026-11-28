import { Schema } from "effect";

/**
 * The research queue (ADR 0030). Every background research session is a BullMQ job
 * (`research-bullmq.ts`), so a bulk import never starts hundreds of agent sessions at once.
 * BullMQ keeps the line and the global limit; a slot set per workspace and kind keeps each
 * workspace's limit for that kind, so a flood of one kind never holds up the others. A job holds its slot for as long as its agent session runs. Postgres keeps each record's
 * status (`pending` → `running` → `complete`/`skipped`/`failed`), and Electric syncs it to the UI.
 */

export const JOB_KINDS = ["company", "contact", "deal", "fill"] as const;

const JobKind = Schema.Literals(JOB_KINDS);

export type JobKind = typeof JobKind.Type;

const FillField = Schema.Struct({ id: Schema.String, entity: Schema.String, label: Schema.String });

export const ResearchJob = Schema.Struct({
  /** One job per subject at a time: `research-<record id>`, or `fill-<field id>-<minute>`. */
  id: Schema.String,
  workspaceId: Schema.String,
  /** The member the session acts as. */
  userId: Schema.String,
  kind: JobKind,
  recordId: Schema.NullOr(Schema.String),
  field: Schema.NullOr(FillField),
  /** eve's create-once key for the session; a retry gets a new one. */
  operationId: Schema.String,
});

export type ResearchJob = typeof ResearchJob.Type;

/** A job's data as BullMQ stored it; none when it is not a job. */
export const parseJob = Schema.decodeUnknownOption(ResearchJob);

/** How much research runs at once. Generous: they stop a flood, not normal work. */
export interface QueueLimits {
  /** Sessions of each kind one workspace may run at once. */
  readonly workspace: Readonly<Record<JobKind, number>>;
  /** Sessions the whole API may run at once (BullMQ's global concurrency). */
  readonly global: number;
  /**
   * How long a session may hold its slot without reporting its end. A session that ends reports
   * it at once; this only frees the slot of one that died.
   */
  readonly leaseMs: number;
}

export const DEFAULT_LIMITS: QueueLimits = {
  workspace: { company: 25, contact: 10, deal: 2, fill: 2 },
  global: 1000,
  leaseMs: 30 * 60 * 1000,
};

/**
 * Each workspace's running sessions, one set per job kind. Redis in the API; `createMemorySlots`
 * in tests.
 */
export interface WorkspaceSlots {
  /**
   * Takes a slot of the job's kind until `leaseUntil`, freeing lapsed slots first. True when the
   * job now holds one, including a slot it already held (a job BullMQ runs again after a restart).
   */
  acquire(job: ResearchJob, at: number, leaseUntil: number, limit: number): Promise<boolean>;
  release(job: ResearchJob): Promise<void>;
  /** Whether the job holds a slot of any kind in this workspace; how a session's end is checked. */
  holds(workspaceId: string, jobId: string): Promise<boolean>;
}

/** Word that a session ended, from the agent's hook to the job waiting on it. */
export interface SessionEnds {
  /** Resolves true when the session ends, or false at `deadline`. */
  wait(jobId: string, deadline: number): Promise<boolean>;
  end(jobId: string): Promise<void>;
}

export interface RunDependencies {
  readonly slots: WorkspaceSlots;
  readonly ends: SessionEnds;
  readonly limits: QueueLimits;
  readonly now: () => number;
  /**
   * Starts the job's session; false when there is nothing to research any more (the record was
   * archived or its member left). Throws when the session could not start.
   */
  readonly begin: (job: ResearchJob) => Promise<boolean>;
  readonly log: (message: string, cause?: unknown) => void;
}

/**
 * One job, as BullMQ's worker runs it: `busy` when its workspace has no free slot of its kind (the
 * worker delays it),
 * otherwise it holds a slot until its session ends, and `done`.
 */
export async function runResearchJob(job: ResearchJob, deps: RunDependencies) {
  const at = deps.now();
  const leaseUntil = at + deps.limits.leaseMs;

  const limit = deps.limits.workspace[job.kind];

  if (!(await deps.slots.acquire(job, at, leaseUntil, limit))) return "busy";

  try {
    if ((await deps.begin(job)) && !(await deps.ends.wait(job.id, leaseUntil))) {
      deps.log(`research queue: ${job.id} held its slot past the lease`);
    }
  } catch (cause) {
    deps.log(`research: ${job.kind} ${job.recordId ?? job.field?.id ?? job.id}`, cause);
  } finally {
    await deps.slots.release(job);
  }

  return "done";
}

/** In-process slots with the Redis slots' rules, for tests. */
export function createMemorySlots() {
  /** `<workspace>:<kind>` → job id → lease end. */
  const held = new Map<string, Map<string, number>>();

  const of = (workspaceId: string, kind: JobKind) => {
    const key = `${workspaceId}:${kind}`;
    const slots = held.get(key) ?? new Map<string, number>();

    held.set(key, slots);

    return slots;
  };

  const slots: WorkspaceSlots & { running(workspaceId: string, kind?: JobKind): number } = {
    acquire: async (job, at, leaseUntil, limit) => {
      const lane = of(job.workspaceId, job.kind);

      for (const [id, until] of lane) if (until <= at) lane.delete(id);

      if (!lane.has(job.id) && lane.size >= limit) return false;

      lane.set(job.id, leaseUntil);

      return true;
    },
    release: async (job) => {
      of(job.workspaceId, job.kind).delete(job.id);
    },
    holds: async (workspaceId, jobId) => JOB_KINDS.some((kind) => of(workspaceId, kind).has(jobId)),
    running: (workspaceId, kind) => {
      const kinds: readonly JobKind[] = kind ? [kind] : JOB_KINDS;

      return kinds.reduce((sum, each) => sum + of(workspaceId, each).size, 0);
    },
  };

  return slots;
}

/** In-process session ends, for tests: real timers, so keep test leases short. */
export function createMemoryEnds(now: () => number = Date.now) {
  const waiting = new Map<string, () => void>();
  const ended = new Set<string>();

  const ends: SessionEnds = {
    wait: (jobId, deadline) => {
      if (ended.delete(jobId)) return Promise.resolve(true);

      return new Promise((resolve) => {
        const timer = setTimeout(
          () => {
            waiting.delete(jobId);
            resolve(false);
          },
          Math.max(0, deadline - now()),
        );

        waiting.set(jobId, () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    },
    end: async (jobId) => {
      const wake = waiting.get(jobId);

      if (!wake) {
        ended.add(jobId);

        return;
      }

      waiting.delete(jobId);
      wake();
    },
  };

  return ends;
}
