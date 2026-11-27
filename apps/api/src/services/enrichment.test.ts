import { describe, expect, test } from "bun:test";
import { readTregAnswer, type Treg, type TregRequest } from "@crm/core/enrichment";
import { createMemoryKv } from "@crm/core/kv";
import {
  type EnrichmentCaller,
  makeEnrichment,
  NotAMember,
  questionKey,
  type UsageRow,
} from "./Enrichment.ts";

const caller: EnrichmentCaller = {
  userId: "user_1",
  workspaceId: "ws_a",
  origin: "research",
  record: { kind: "contact", id: "ctc_1" },
};

/** A treg that answers every call with one found email, checked valid, for 4950 micro-USD. */
function fakeTreg() {
  const calls: TregRequest[] = [];

  const treg: Treg = {
    call: async (request) => {
      calls.push(request);

      const answer = readTregAnswer(
        request.contract,
        JSON.stringify({
          output: { email: "ada@example-ventures.com", verified: true },
          _treg: { outcome: "hit", verification: { verdict: "valid", checked: true } },
        }),
        new Headers({
          "x-treg-cost-micro": "4950",
          "x-treg-call-id": `call_${calls.length}`,
          "x-treg-served-by": "crawl4ai.people.email.find",
        }),
      );

      if (!answer) throw new Error("unreadable fixture");

      return answer;
    },
  };

  return { treg, calls };
}

function setup(markupBps = 0) {
  const { treg, calls } = fakeTreg();
  const rows: UsageRow[] = [];
  let next = 0;

  const enrichment = makeEnrichment({
    treg,
    kv: createMemoryKv(),
    store: {
      isMember: async (workspaceId, userId) =>
        `${workspaceId}:${userId}` === "ws_a:user_1" ||
        `${workspaceId}:${userId}` === "ws_b:user_9",
      markupBps: async () => markupBps,
      record: async (row) => {
        rows.push(row);
      },
    },
    newId: () => `use_${(next += 1)}`,
  });

  return { enrichment, calls, rows };
}

const find = {
  contract: "people.email.find" as const,
  body: { full_name: "Ada Park", domain: "example-ventures.com" },
  verify: true,
};

describe("enrichment", () => {
  test("files each call under the workspace, with its cost and the workspace's price", async () => {
    const env = setup(2000);

    const result = await env.enrichment.call(caller, find);

    expect(result.usage).toEqual({ usageId: "use_1", priceMicro: 5940, outcome: "hit" });
    expect(env.calls[0]?.meta).toEqual({
      workspace: "ws_a",
      user: "user_1",
      origin: "research",
      record: "ctc_1",
    });
    expect(env.rows[0]).toMatchObject({
      workspaceId: "ws_a",
      origin: "research",
      contract: "people.email.find",
      costMicro: 4950,
      priceMicro: 5940,
      recordId: "ctc_1",
      providerCallId: "call_1",
    });
  });

  test("asks the same question once: the second answer is ours, and free", async () => {
    const env = setup();

    await env.enrichment.call(caller, find);

    const again = await env.enrichment.call(caller, {
      ...find,
      body: { domain: "example-ventures.com", full_name: "Ada Park" },
    });

    expect(env.calls).toHaveLength(1);
    expect(again.usage).toMatchObject({ priceMicro: 0, outcome: "cached" });
    expect(again.answer.output).toMatchObject({ email: "ada@example-ventures.com" });
  });

  test("shares answers across workspaces: the second workspace pays nothing", async () => {
    const env = setup();
    const other = { ...caller, userId: "user_9", workspaceId: "ws_b" };

    await env.enrichment.call(caller, find);

    const again = await env.enrichment.call(other, find);

    expect(env.calls).toHaveLength(1);
    expect(again.usage).toMatchObject({ priceMicro: 0, outcome: "cached" });
    expect(again.answer.output).toMatchObject({ email: "ada@example-ventures.com" });
    expect(env.rows[1]).toMatchObject({ workspaceId: "ws_b", outcome: "cached", costMicro: 0 });
    expect(await env.enrichment.emailStatus(other, "ada@example-ventures.com")).toBe("valid");
    expect(env.calls).toHaveLength(1);
  });

  test("remembers the email's check, so recording it needs no second call", async () => {
    const env = setup();

    await env.enrichment.call(caller, find);

    expect(await env.enrichment.emailStatus(caller, "Ada@Example-Ventures.com")).toBe("valid");
    expect(env.calls).toHaveLength(1);
  });

  test("refuses a caller who is not a member, before spending anything", async () => {
    const env = setup();

    await expect(env.enrichment.call({ ...caller, userId: "user_2" }, find)).rejects.toBeInstanceOf(
      NotAMember,
    );
    expect(env.calls).toHaveLength(0);
    expect(env.rows).toHaveLength(0);
  });

  test("one question has one key, whatever the order; blanks are not part of it", () => {
    expect(
      questionKey({ contract: "people.enrich", body: { email: "a@b.co", domain: undefined } }),
    ).toBe(questionKey({ contract: "people.enrich", body: { full_name: "", email: "a@b.co" } }));
  });
});
