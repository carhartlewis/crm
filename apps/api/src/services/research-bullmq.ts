import { createBunRedisClient, DelayedError, Queue, Worker } from "bullmq";
import { RedisClient } from "bun";
import { Option } from "effect";
import {
  parseJob,
  type QueueLimits,
  type ResearchJob,
  type SessionEnds,
  type WorkspaceSlots,
} from "./research-queue.ts";

/**
 * The research queue on BullMQ (ADR 0030), through Bun's native Redis client
 * (`createBunRedisClient`). BullMQ keeps the jobs, their order, restarts and the global limit;
 * the workspace slots and session ends below are small Redis keys of our own.
 */

/** BullMQ's queue name (no `:` allowed); its keys live under `crm:bull`. */
export const RESEARCH_QUEUE = "research";
const PREFIX = "crm:bull";

/** A job whose workspace is full waits about this long before it tries again. */
const BUSY_DELAY_MS = 5000;

/** How often a waiting job checks for its session's end when another API instance got it. */
const END_POLL_MS = 1000;

/** An ended session's mark lives this long, for a job that hasn't started waiting yet. */
const ENDED_TTL_SECONDS = 60 * 60;

type Redis = Pick<RedisClient, "send">;

// KEYS: the workspace's slots. ARGV: job id, now, lease end, limit. Frees lapsed slots, then
// renews the job's slot or takes a free one. One key, so it is atomic and cluster-safe.
const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
if redis.call('ZSCORE', KEYS[1], ARGV[1]) or redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[4]) then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
  redis.call('PEXPIREAT', KEYS[1], ARGV[3])
  return 1
end
return 0`;

/** Each workspace's running sessions: a sorted set of job ids scored by when their lease ends. */
export function createRedisSlots(redis: Redis, prefix = "crm"): WorkspaceSlots {
  const key = (workspaceId: string) => `${prefix}:research:slots:${workspaceId}`;

  return {
    acquire: async (job, at, leaseUntil, limit) => {
      const taken: number = await redis.send("EVAL", [
        ACQUIRE,
        "1",
        key(job.workspaceId),
        job.id,
        String(at),
        String(leaseUntil),
        String(limit),
      ]);

      return taken === 1;
    },
    release: async (job) => {
      await redis.send("ZREM", [key(job.workspaceId), job.id]);
    },
    holds: async (workspaceId, jobId) => {
      const score: string | null = await redis.send("ZSCORE", [key(workspaceId), jobId]);

      return score !== null;
    },
  };
}

/**
 * A session's end, across API instances: a Redis mark the waiting job polls for, and an
 * in-process wake-up when the same instance runs the job (the usual case).
 */
export function createRedisEnds(
  redis: Redis,
  prefix = "crm",
  now: () => number = Date.now,
): SessionEnds {
  const key = (jobId: string) => `${prefix}:research:ended:${jobId}`;
  const waiting = new Map<string, () => void>();

  const take = async (jobId: string) => {
    const mark: string | null = await redis.send("GETDEL", [key(jobId)]);

    return mark !== null;
  };

  return {
    wait: async (jobId, deadline) => {
      let woken = false;

      waiting.set(jobId, () => {
        woken = true;
      });

      try {
        while (now() < deadline) {
          // oxlint-disable-next-line no-await-in-loop -- one check a second until the end.
          if (woken || (await take(jobId))) return true;

          // oxlint-disable-next-line no-await-in-loop -- as above.
          await new Promise((resolve) => setTimeout(resolve, END_POLL_MS));
        }

        return woken || take(jobId);
      } finally {
        waiting.delete(jobId);
        await redis.send("DEL", [key(jobId)]);
      }
    },
    end: async (jobId) => {
      const wake = waiting.get(jobId);

      if (wake) {
        wake();

        return;
      }

      await redis.send("SET", [key(jobId), "1", "EX", String(ENDED_TTL_SECONDS)]);
    },
  };
}

export interface ResearchQueue {
  /** Queues a job; false when a job with its id is already waiting, delayed or running. */
  readonly enqueue: (job: ResearchJob) => Promise<boolean>;
}

/** A Bun Redis connection for BullMQ; BullMQ duplicates it for the worker's blocking reads. */
const connection = (redisUrl: string) => createBunRedisClient(new RedisClient(redisUrl));

export function createResearchQueue(redisUrl: string, prefix = PREFIX) {
  const queue = new Queue(RESEARCH_QUEUE, { connection: connection(redisUrl), prefix });

  const research: ResearchQueue = {
    enqueue: async (job) => {
      if (await queue.getJob(job.id)) return false;

      // Done jobs are removed, so the same record can be queued again later.
      await queue.add(job.kind, job, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: true,
      });

      return true;
    },
  };

  return { research, queue };
}

/**
 * Runs research jobs: up to `limits.global` at once across every API instance (BullMQ's global
 * concurrency). A job whose workspace is full goes back to the delayed set and tries again.
 */
export async function startResearchWorker(
  redisUrl: string,
  queue: Queue,
  limits: QueueLimits,
  run: (job: ResearchJob) => Promise<"busy" | "done">,
  log: (message: string, cause?: unknown) => void,
  prefix = PREFIX,
) {
  await queue.setGlobalConcurrency(limits.global);

  const worker = new Worker(
    RESEARCH_QUEUE,
    async (job, token) => {
      const data = Option.getOrNull(parseJob(job.data));

      if (!data) {
        log(`research queue: dropped job ${job.id ?? "?"} with unreadable data`);

        return;
      }

      if ((await run(data)) === "busy") {
        await job.moveToDelayed(Date.now() + BUSY_DELAY_MS, token);

        throw new DelayedError();
      }
    },
    {
      connection: connection(redisUrl),
      prefix,
      concurrency: limits.global,
      // A session can run for many minutes; BullMQ renews the lock while the job waits.
      maxStalledCount: 3,
    },
  );

  worker.on("failed", (job, cause) => log(`research queue: job ${job?.id ?? "?"} failed`, cause));
  worker.on("error", (cause) => log("research queue: worker error", cause));

  return worker;
}
