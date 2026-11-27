import { describe, expect, test } from "bun:test";
import type { JevAnswer, JevClient } from "@crm/memory/jev";
import { jevFollowUpJudge } from "./follow-up.ts";

const jevAnswering = (answer: JevAnswer | Error): JevClient => ({
  decide: async () => {
    if (answer instanceof Error) throw answer;

    return { model: "fake", answers: { handling: answer } };
  },
});

const input = { task: "Research our customers' news", message: "Also add Mercury" };
const signal = new AbortController().signal;

describe("the follow-up judge", () => {
  test("queues a separate request Jev is sure can wait", async () => {
    const judge = jevFollowUpJudge(
      jevAnswering({ type: "choice", choice: "queue", probability: 0.8 }),
    );

    expect(await judge(input, signal)).toBe("queue");
  });

  test("steers a correction, an unsure answer, and when Jev fails", async () => {
    const steer = jevFollowUpJudge(
      jevAnswering({ type: "choice", choice: "steer", probability: 0.9 }),
    );

    const unsure = jevFollowUpJudge(
      jevAnswering({ type: "choice", choice: "queue", probability: 0.5 }),
    );

    const down = jevFollowUpJudge(jevAnswering(new Error("gateway down")));

    expect(await steer(input, signal)).toBe("steer");
    expect(await unsure(input, signal)).toBe("steer");
    expect(await down(input, signal)).toBe("steer");
  });
});
