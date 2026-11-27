import type { JevClient } from "@crm/memory/jev";

/**
 * What to do with a message sent while the agent is still working: `steer` redirects the running
 * turn now, `queue` waits for it to finish. The person never chooses; this decides.
 */
export type FollowUpMode = "steer" | "queue";

export interface FollowUpJudge {
  (input: { task: string; message: string }, signal: AbortSignal): Promise<FollowUpMode>;
}

/** How sure Jev must be that a message can wait before it is queued. */
export const QUEUE_THRESHOLD = 0.6;

/** How long a send waits for the answer; past it, the message steers. */
export const FOLLOW_UP_WAIT_MS = 2000;

/**
 * Jev (a decision model) judges the message against the task in progress. When unsure, slow or
 * unavailable, the message steers, T3 Code's default: a correction that waited would be worse
 * than a request that arrived early.
 */
export function jevFollowUpJudge(jev: JevClient): FollowUpJudge {
  return async ({ task, message }, signal) => {
    const result = await jev
      .decide(
        {
          state: { taskInProgress: task, newMessage: message },
          questions: {
            handling: {
              type: "choice",
              instructions:
                "A person sent newMessage to an assistant that is still working on taskInProgress. Decide how the assistant should handle newMessage.",
              criteria: {
                steer:
                  "It changes, corrects, narrows, extends, stops or adds detail to the task in progress, so the assistant should take it into account now.",
                queue:
                  "It is a separate request that doesn't affect the task in progress and can wait until that task is finished.",
              },
            },
          },
        },
        signal,
      )
      .catch(() => null);

    const answer = result?.answers["handling"];

    return answer?.type === "choice" &&
      answer.choice === "queue" &&
      answer.probability >= QUEUE_THRESHOLD
      ? "queue"
      : "steer";
  };
}
