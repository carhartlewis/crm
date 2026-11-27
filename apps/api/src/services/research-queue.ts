import { Schema } from "effect";

/**
 * The research queue (ADR 0030). Every background research session is a BullMQ job
 * (`research-bullmq.ts`), so a bulk import never starts hundreds of agent sessions at once.
 * BullMQ keeps the line and the global limit; a slot set per workspace keeps each workspace's
 * limit. A job holds its slot for as long as its agent session runs. Postgres keeps each record's
 * status (`pending` → `running` → `complete`/`skipped`/`failed`), and Electric syncs it to the UI.
 */

const JobKind = Schema.Literals(["company", "contact", "deal", "fill"]);

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
  /** Sessions one workspace may run at once. */
  readonly workspace: number;
  /** Sessions the whole API may run at once (BullMQ's global concurrency). */
  readonly global: number;
  /**
   * How long a session may hold its slot without reporting its end. A session that ends reports
   * it at once; this only frees the slot of one that died.
   */
  readonly leaseMs: number;
}

export const DEFAULT_LIMITS: QueueLimits = {
  workspace: 10,
  global: 50,
  leaseMs: 30 * 60 * 1000,
};

/** Each workspace's running sessions. Redis in the API; `createMemorySlots` in tests. */
export interface WorkspaceSlots {
  /**
   * Takes a slot for the job until `leaseUntil`, freeing lapsed slots first. True when the job
   * now holds one, including a slot it already held (a job BullMQ runs again after a restart).
   */
  acquire(job: ResearchJob, at: number, leaseUntil: number, limit: number): Promise<boolean>;
  release(job: ResearchJob): Promise<void>;
  /** Whether the job holds a slot in this workspace; how a session's end is checked. */
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
 * One job, as BullMQ's worker runs it: `busy` when its workspace is full (the worker delays it),
 * otherwise it holds a slot until its session ends, and `done`.
 */
export async function runResearchJob(job: ResearchJob, deps: RunDependencies) {
  const at = deps.now();
  const leaseUntil = at + deps.limits.leaseMs;

  if (!(await deps.slots.acquire(job, at, leaseUntil, deps.limits.workspace))) return "busy";

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
  /** Workspace → job id → lease end. */
  const held = new Map<string, Map<string, number>>();

  const of = (workspaceId: string) => {
    const slots = held.get(workspaceId) ?? new Map<string, number>();

    held.set(workspaceId, slots);

    return slots;
  };

  const slots: WorkspaceSlots & { running(workspaceId: string): number } = {
    acquire: async (job, at, leaseUntil, limit) => {
      const workspace = of(job.workspaceId);

      for (const [id, until] of workspace) if (until <= at) workspace.delete(id);

      if (!workspace.has(job.id) && workspace.size >= limit) return false;

      workspace.set(job.id, leaseUntil);

      return true;
    },
    release: async (job) => {
      of(job.workspaceId).delete(job.id);
    },
    holds: async (workspaceId, jobId) => of(workspaceId).has(jobId),
    running: (workspaceId) => of(workspaceId).size,
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
