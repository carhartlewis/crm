import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Cause, Effect, Exit, Option, References } from "effect";
import { type FactJudge, type IntelActor, makeIntel } from "./Intel.ts";
import { createMemoryIntelStore } from "./intel-store-memory.ts";
import { contactResearch, intelTools, type ResearchMemory } from "./intel-tools.ts";

const alice: IntelActor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const bob: IntelActor = { userId: "user_bob", activeWorkspaceId: "ws_b" };
const now = new Date("2026-11-26T12:00:00Z");

const PHOTO = "https://media.brand.dev/pfp/0f8fad5b-d9cb-469f-a165-70867728950e.png";

/** Mailbox and line checks as the Enrichment service would answer them. */
const checks = {
  email: async (_actor: IntelActor, email: string) =>
    email.startsWith("valid")
      ? ("valid" as const)
      : email.startsWith("catchall")
        ? ("catch_all" as const)
        : email.startsWith("bounce")
          ? ("invalid" as const)
          : ("unknown" as const),
  phone: async (phone: string) =>
    phone.endsWith("0000") ? ("dead" as const) : phone.startsWith("+1") ? ("live" as const) : null,
};

function setup(judge: FactJudge | null = null) {
  const memory = createMemoryIntelStore(["ws_a:user_alice", "ws_b:user_bob"]);
  const companyId = createId("com");
  const contactId = createId("ctc");
  const dealId = createId("del");

  memory.seed("company", { id: companyId, workspaceId: "ws_a", enrichmentStatus: "pending" });
  memory.seed("contact", { id: contactId, workspaceId: "ws_a", companyId });
  memory.seed("deal", { id: dealId, workspaceId: "ws_a", companyId });

  const intel = makeIntel(memory.store, {
    now: () => now,
    judge,
    photos: async (id, source) =>
      source === PHOTO ? `https://store.test/contacts/${id}/photo` : null,
    checks,
  });

  return { ...memory, intel, companyId, contactId, dealId };
}

/** The tag of the failure, or "Success". */
async function outcome<A, E extends object>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(
    Effect.provideService(effect, References.MinimumLogLevel, "None"),
  );

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    onSome: (error) => error.constructor.name,
  });
}

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

describe("enrichment status", () => {
  test("running, then complete stamps the time and clears the error", async () => {
    const env = setup();
    const input = { kind: "company", id: env.companyId };

    await run(env.intel.setEnrichment(alice, { ...input, status: "failed", error: "No site" }));
    expect(env.record("company", env.companyId)?.enrichmentError).toBe("No site");

    await run(env.intel.setEnrichment(alice, { ...input, status: "complete" }));

    const row = env.record("company", env.companyId);

    expect(row?.enrichmentStatus).toBe("complete");
    expect(row?.enrichedAt).toEqual(now);
    expect(row?.enrichmentError).toBeNull();
  });

  test("another workspace's record and unknown statuses are refused", async () => {
    const env = setup();

    expect(
      await outcome(
        env.intel.setEnrichment(bob, { kind: "company", id: env.companyId, status: "running" }),
      ),
    ).toBe("NotFound");
    expect(
      await outcome(
        env.intel.setEnrichment(alice, { kind: "company", id: env.companyId, status: "pending" }),
      ),
    ).toBe("Invalid");
  });
});

describe("research settles when its session ends", () => {
  test("a finished turn completes research the agent left open", async () => {
    const env = setup();
    const input = { kind: "contact", id: env.contactId };

    await run(env.intel.setEnrichment(alice, { ...input, status: "running" }));

    const result = await run(env.intel.settleResearch(alice, { ...input, outcome: "completed" }));
    const row = env.record("contact", env.contactId);

    expect(result.settled).toBe(true);
    expect(row?.enrichmentStatus).toBe("complete");
    expect(row?.enrichedAt).toEqual(now);
  });

  test.each(["failed", "cancelled", "paused"])(
    "a %s turn marks open research failed, never forever running",
    async (ended) => {
      const env = setup();

      await run(
        env.intel.settleResearch(alice, { kind: "company", id: env.companyId, outcome: ended }),
      );

      const row = env.record("company", env.companyId);

      expect(row?.enrichmentStatus).toBe("failed");
      expect(row?.enrichmentError).toBe("Research stopped before it finished");
    },
  );

  test("a status the agent already set stays", async () => {
    const env = setup();
    const input = { kind: "contact", id: env.contactId };

    await run(env.intel.setEnrichment(alice, { ...input, status: "skipped" }));

    const result = await run(env.intel.settleResearch(alice, { ...input, outcome: "failed" }));

    expect(result.settled).toBe(false);
    expect(env.record("contact", env.contactId)?.enrichmentStatus).toBe("skipped");
  });

  test("another workspace's record is refused", async () => {
    const env = setup();

    expect(
      await outcome(
        env.intel.settleResearch(bob, {
          kind: "company",
          id: env.companyId,
          outcome: "completed",
        }),
      ),
    ).toBe("NotFound");
  });
});

describe("contact facts", () => {
  const sourced = { field: "title", sourceUrl: "https://example.com" };

  test("a sure fact fills an empty field at once; an unsure one is not stored", async () => {
    const env = setup();

    const saved = await run(
      env.intel.recordFact(alice, {
        contactId: env.contactId,
        ...sourced,
        value: "CTO",
        score: 0.9,
      }),
    );

    expect(saved.outcome).toBe("applied");
    expect(env.record("contact", env.contactId)?.values?.["title"]).toBe("CTO");
    expect(env.facts()[0]).toMatchObject({ status: "applied", band: "verified" });

    const unsure = await run(
      env.intel.recordFact(alice, {
        contactId: env.contactId,
        ...sourced,
        value: "CEO",
        score: 0.4,
      }),
    );

    expect(unsure).toMatchObject({ id: null, outcome: "too_unsure" });
    expect(env.record("contact", env.contactId)?.values?.["title"]).toBe("CTO");
  });

  test("newer research replaces what the agent wrote", async () => {
    const env = setup();
    const fact = { contactId: env.contactId, ...sourced };

    await run(env.intel.recordFact(alice, { ...fact, value: "VP Engineering", score: 0.7 }));
    await run(env.intel.recordFact(alice, { ...fact, value: "CTO", score: 0.8 }));

    expect(env.record("contact", env.contactId)?.values?.["title"]).toBe("CTO");
  });

  test("a member's own value stays unless Jev reads a real change", async () => {
    const asked: string[] = [];

    const judge: FactJudge = async ({ proposed }) => {
      asked.push(proposed);

      return proposed === "VP of Engineering" ? "same" : proposed === "CTO" ? "update" : "unsure";
    };

    const env = setup(judge);
    const fact = { contactId: env.contactId, ...sourced, score: 0.95 };

    env.seed("contact", { id: env.contactId, workspaceId: "ws_a", values: { title: "VP Eng" } });

    expect(
      (await run(env.intel.recordFact(alice, { ...fact, value: "VP of Engineering" }))).outcome,
    ).toBe("kept");
    expect((await run(env.intel.recordFact(alice, { ...fact, value: "Founder" }))).outcome).toBe(
      "proposed",
    );
    expect(env.record("contact", env.contactId)?.values?.["title"]).toBe("VP Eng");

    expect((await run(env.intel.recordFact(alice, { ...fact, value: "CTO" }))).outcome).toBe(
      "applied",
    );
    expect(env.record("contact", env.contactId)?.values?.["title"]).toBe("CTO");
    expect(asked).toEqual(["VP of Engineering", "Founder", "CTO"]);
    // The newer fact superseded the open question.
    expect(env.facts().find((row) => row.value === "Founder")?.status).toBe("superseded");
  });

  test("a photo is copied into storage; other hosts are refused", async () => {
    const env = setup();
    const fact = { contactId: env.contactId, field: "image_url", score: 0.92 };

    await run(env.intel.recordFact(alice, { ...fact, value: PHOTO }));

    expect(env.record("contact", env.contactId)?.values?.["image_url"]).toBe(
      `https://store.test/contacts/${env.contactId}/photo`,
    );
    expect(
      await outcome(env.intel.recordFact(alice, { ...fact, value: "https://evil.test/a.png" })),
    ).toBe("Invalid");
  });

  test("fields outside the list, bad scores and bad URLs are refused", async () => {
    const env = setup();
    const base = { contactId: env.contactId, score: 0.5 };

    expect(
      await outcome(env.intel.recordFact(alice, { ...base, field: "email", value: "x" })),
    ).toBe("Invalid");
    expect(
      await outcome(
        env.intel.recordFact(alice, { ...base, field: "title", value: "CTO", score: 2 }),
      ),
    ).toBe("Invalid");
    expect(
      await outcome(
        env.intel.recordFact(alice, { ...base, field: "linkedin_url", value: "not a url" }),
      ),
    ).toBe("Invalid");
  });

  test("a member applies or dismisses a proposal once", async () => {
    const env = setup(async () => "unsure");

    env.seed("contact", {
      id: env.contactId,
      workspaceId: "ws_a",
      values: { seniority: "Manager" },
    });

    const { id } = await run(
      env.intel.recordFact(alice, {
        contactId: env.contactId,
        field: "seniority",
        value: "Executive",
        score: 0.95,
      }),
    );

    if (!id) throw new Error("expected a proposal");

    expect(await outcome(env.intel.decideFact(bob, id, "applied"))).toBe("NotFound");

    await run(env.intel.decideFact(alice, id, "applied"));

    expect(env.facts()[0]).toMatchObject({ status: "applied", decidedById: "user_alice" });
    expect(await outcome(env.intel.decideFact(alice, id, "dismissed"))).toBe("Invalid");
  });
});

describe("contact briefs", () => {
  test("one brief per contact; a rewrite replaces it", async () => {
    const env = setup();

    const brief = {
      contactId: env.contactId,
      narrative: "Runs the platform org.",
      sections: {
        currentRole: "VP of Engineering",
        previousRoles: [{ title: "Director", company: "Meridian Grid", years: "2019–2022" }],
      },
    };

    await run(env.intel.writeBrief(alice, brief));
    await run(env.intel.writeBrief(alice, { ...brief, narrative: "Owns the vendor decision." }));

    const stored = env.brief(env.contactId);

    expect(stored?.narrative).toBe("Owns the vendor decision.");
    expect(stored?.sections).toMatchObject({ currentRole: "VP of Engineering", tenure: null });
    expect(await outcome(env.intel.writeBrief(bob, brief))).toBe("NotFound");
  });
});

describe("email and meeting activity", () => {
  test("one activity per thread: a re-sync updates it and fills in the company", async () => {
    const env = setup();

    const email = {
      threadId: "thread-1",
      subject: "Rollout plan",
      summary: "Priya asked for the security review.",
      occurredAt: "2026-11-20T09:00:00Z",
      messages: 3,
      contactId: env.contactId,
      externalUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
    };

    const first = await run(env.intel.logEmail(alice, email));
    const again = await run(env.intel.logEmail(alice, { ...email, messages: 5 }));

    expect(first.created).toBe(true);
    expect(again).toMatchObject({ id: first.id, created: false });

    const [activity] = env.activities();

    expect(env.activities()).toHaveLength(1);
    expect(activity).toMatchObject({
      type: "email",
      source: "email",
      companyId: env.companyId,
      meta: { messages: 5 },
      createdById: "user_alice",
    });
    expect(env.record("contact", env.contactId)?.lastActivityAt).toEqual(
      new Date(email.occurredAt),
    );
  });

  test("a future meeting doesn't move last activity; it needs a record", async () => {
    const env = setup();

    await run(
      env.intel.logMeeting(alice, {
        eventId: "event-1",
        subject: "Rollout checkpoint",
        occurredAt: "2026-12-11T15:00:00Z",
        durationMinutes: 45,
        attendees: 4,
        dealId: env.dealId,
      }),
    );

    expect(env.activities()[0]?.meta).toEqual({ durationMinutes: 45, attendees: 4 });
    expect(env.record("deal", env.dealId)?.lastActivityAt).toBeUndefined();
    expect(
      await outcome(
        env.intel.logMeeting(alice, {
          eventId: "event-2",
          subject: "Lunch",
          occurredAt: "2026-11-20T12:00:00Z",
        }),
      ),
    ).toBe("Invalid");
  });
});

/** Research saved to memory, as `<record id>: <content>`; the deal `del_gone…` is unknown. */
function researchMemory() {
  const saved: string[] = [];

  const memory: ResearchMemory = {
    research: async (_caller, input) => {
      if (input.dealId?.startsWith("del_gone")) {
        return { ok: false, status: 404, message: "No such record in this workspace." };
      }

      saved.push(`${input.contactId ?? input.dealId}: ${input.content}`);

      return { ok: true, value: null };
    },
  };

  return { memory, saved };
}

const caller = { userId: "user_alice", workspaceId: "ws_a" };

describe("agent tools", () => {
  test("every tool writes, none is destructive, and calls run as the caller", async () => {
    const env = setup();
    const tools = intelTools(env.intel, caller, researchMemory().memory);

    expect(tools.map((item) => item.tool.name)).toEqual([
      "crm__set_enrichment_status",
      "crm__record_contact_fact",
      "crm__write_contact_brief",
      "crm__write_deal_brief",
      "crm__log_email",
      "crm__log_meeting",
    ]);

    for (const item of tools) {
      expect(item.tool.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    }

    const logEmail = tools.find((item) => item.tool.name === "crm__log_email");

    const result = await logEmail?.call({
      thread_id: "t-9",
      subject: "Pricing",
      occurred_at: "2026-11-25T10:00:00Z",
      contact_id: env.contactId,
    });

    expect(result?.isError).toBeUndefined();
    expect(env.activities()[0]?.createdById).toBe("user_alice");

    const refused = await logEmail?.call({ thread_id: "t-10", subject: "x", occurred_at: "soon" });

    expect(refused?.isError).toBe(true);
  });

  test("a contact brief is also saved as the contact's research in memory", async () => {
    const env = setup();
    const { memory, saved } = researchMemory();
    const tools = intelTools(env.intel, caller, memory, () => now);
    const brief = tools.find((item) => item.tool.name === "crm__write_contact_brief");

    const result = await brief?.call({
      contact_id: env.contactId,
      narrative: "Wile runs procurement at Acme.",
      current_role: "Head of Procurement",
      previous_roles: [{ title: "Buyer", company: "Beta Labs", years: "2019–2022" }],
      location: null,
    });

    expect(result?.isError).toBeUndefined();
    expect(saved).toEqual([
      `${env.contactId}: # Profile research
Researched on 2026-11-26.

Wile runs procurement at Acme.

- Current role: Head of Procurement
- Previous roles:
  - Buyer at Beta Labs (2019–2022)`,
    ]);
  });

  test("a brief that fails is not remembered", async () => {
    const env = setup();
    const { memory, saved } = researchMemory();
    const tools = intelTools(env.intel, caller, memory);
    const brief = tools.find((item) => item.tool.name === "crm__write_contact_brief");

    const result = await brief?.call({ contact_id: createId("ctc"), narrative: "Nobody." });

    expect(result?.isError).toBe(true);
    expect(saved).toEqual([]);
  });

  test("a deal brief is saved as the deal's research; an unknown deal is refused", async () => {
    const env = setup();
    const { memory, saved } = researchMemory();
    const tools = intelTools(env.intel, caller, memory, () => now);
    const brief = tools.find((item) => item.tool.name === "crm__write_deal_brief");

    const result = await brief?.call({
      deal_id: env.dealId,
      narrative: "Acme is replacing its rocket supplier.",
      why_now: "A failed launch in October.",
      risks: ["Budget not approved", " "],
    });

    expect(result?.isError).toBeUndefined();
    expect(saved).toEqual([
      `${env.dealId}: # Deal research
Researched on 2026-11-26.

Acme is replacing its rocket supplier.

- Why now: A failed launch in October.
- Risks:
  - Budget not approved`,
    ]);

    const refused = await brief?.call({
      deal_id: "del_gone00000000000000000000",
      narrative: "x",
    });

    expect(refused?.isError).toBe(true);
  });
});

describe("research text", () => {
  test("leaves out what the brief doesn't say", () => {
    expect(contactResearch({ narrative: "Wile runs procurement." }, now)).toBe(
      "# Profile research\nResearched on 2026-11-26.\n\nWile runs procurement.",
    );
  });
});

describe("email and phone facts", () => {
  const fact = { field: "email", sourceUrl: "https://example.com", score: 0.3 };

  test("a verified email fills the contact whatever score the agent gave", async () => {
    const env = setup();

    const saved = await run(
      env.intel.recordFact(alice, { contactId: env.contactId, ...fact, value: "Valid@Acme.com" }),
    );

    expect(saved.outcome).toBe("applied");
    expect(env.record("contact", env.contactId)?.values?.["email"]).toBe("valid@acme.com");
    expect(env.record("contact", env.contactId)).toMatchObject({ emailStatus: "valid" });
  });

  test("a catch-all address fills an empty field; an unconfirmed one is not saved", async () => {
    const env = setup();

    expect(
      (
        await run(
          env.intel.recordFact(alice, {
            contactId: env.contactId,
            ...fact,
            value: "unsure@acme.com",
          }),
        )
      ).outcome,
    ).toBe("too_unsure");

    expect(
      (
        await run(
          env.intel.recordFact(alice, {
            contactId: env.contactId,
            ...fact,
            value: "catchall@acme.com",
          }),
        )
      ).outcome,
    ).toBe("applied");
    expect(env.record("contact", env.contactId)).toMatchObject({ emailStatus: "catch_all" });
  });

  test("an address that bounces is refused", async () => {
    const env = setup();

    expect(
      await outcome(
        env.intel.recordFact(alice, {
          contactId: env.contactId,
          ...fact,
          value: "bounce@acme.com",
        }),
      ),
    ).toBe("Invalid");
  });

  test("a live phone line fills the contact with its type; a dead one is refused", async () => {
    const env = setup();
    const phone = { field: "phone", sourceUrl: null, score: 0.2, phoneType: "mobile" };

    const saved = await run(
      env.intel.recordFact(alice, { contactId: env.contactId, ...phone, value: "+1 843 607 8601" }),
    );

    expect(saved.outcome).toBe("applied");
    expect(env.record("contact", env.contactId)).toMatchObject({
      phoneStatus: "live",
      phoneType: "mobile",
    });
    expect(
      await outcome(
        env.intel.recordFact(alice, {
          contactId: env.contactId,
          ...phone,
          value: "+1 843 607 0000",
        }),
      ),
    ).toBe("Invalid");
  });
});

describe("people added from a search", () => {
  test("research replaces a directory row's values without asking", async () => {
    const env = setup();
    const contactId = createId("ctc");

    env.seed("contact", {
      id: contactId,
      workspaceId: "ws_a",
      source: "search",
      values: { title: "Co-founder" },
    });

    const saved = await run(
      env.intel.recordFact(alice, {
        contactId,
        field: "title",
        value: "Co-Founder & AI Technical Adviser",
        score: 0.9,
        sourceUrl: "https://example.com",
      }),
    );

    expect(saved.outcome).toBe("applied");
    expect(env.record("contact", contactId)?.values?.["title"]).toBe(
      "Co-Founder & AI Technical Adviser",
    );
  });
});
