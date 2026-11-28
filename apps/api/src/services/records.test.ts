import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Cause, Effect, Exit, Option, References } from "effect";
import { makeCompanies } from "./Companies.ts";
import { createMemoryRecordStore } from "./record-store-memory.ts";
import type { Actor } from "./record-writes.ts";
import { makeRecords } from "./Records.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const bob: Actor = { userId: "user_bob", activeWorkspaceId: "ws_b" };

function setup() {
  const memory = createMemoryRecordStore(["ws_a:user_alice", "ws_a:user_carol", "ws_b:user_bob"]);
  const at = new Date("2026-11-26T12:00:00Z");

  return {
    ...memory,
    companies: makeCompanies(memory.store),
    records: makeRecords(memory.store, () => at),
    at,
  };
}

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

async function withCompany(env: ReturnType<typeof setup>, actor = alice) {
  const id = createId("com");

  await run(env.companies.create(actor, { id, name: "Northwind Labs", domain: "northwind.io" }));

  return id;
}

describe("companies", () => {
  test("every editable field normalises; a new domain clears the old logo", async () => {
    const env = setup();
    const id = await withCompany(env);

    env
      .table("company")
      .set(id, { ...env.table("company").get(id), iconUrl: "https://cdn/logo.png" });

    await run(
      env.companies.update(alice, id, {
        industry: " Software ",
        city: "San Francisco",
        email: "Hello@Northwind.io",
        domain: "northwind.dev",
      }),
    );

    expect(env.rows().get(id)).toMatchObject({
      industry: "Software",
      city: "San Francisco",
      email: "hello@northwind.io",
      domain: "northwind.dev",
      website: "https://northwind.io",
      iconUrl: null,
    });
  });

  test("an owner must be a member; archive stamps and restore clears", async () => {
    const env = setup();
    const id = await withCompany(env);

    expect(await outcome(env.companies.update(alice, id, { owner_id: "user_bob" }))).toBe(
      "Invalid",
    );

    await run(env.companies.update(alice, id, { owner_id: "user_carol", archived: true }));
    expect(env.rows().get(id)?.["ownerId"]).toBe("user_carol");
    expect(env.rows().get(id)?.["archivedAt"]).toBeInstanceOf(Date);

    await run(env.companies.update(alice, id, { archived: false }));
    expect(env.rows().get(id)?.["archivedAt"]).toBeNull();
  });

  test("the primary contact must work at the company", async () => {
    const env = setup();
    const id = await withCompany(env);
    const here = createId("ctc");
    const elsewhere = createId("ctc");

    await run(
      env.records.contacts.create(alice, { id: here, first_name: "Priya", company_id: id }),
    );
    await run(env.records.contacts.create(alice, { id: elsewhere, first_name: "Jonah" }));

    expect(await outcome(env.companies.update(alice, id, { primary_contact_id: elsewhere }))).toBe(
      "Invalid",
    );
    await run(env.companies.update(alice, id, { primary_contact_id: here }));
    expect(env.rows().get(id)?.["primaryContactId"]).toBe(here);
  });

  test("re-enrich queues only with a domain, and only in the caller's workspace", async () => {
    const queued: string[] = [];
    const memory = createMemoryRecordStore(["ws_a:user_alice", "ws_b:user_bob"]);

    const companies = makeCompanies(memory.store, {
      domainChanged: (_, id, domain) => queued.push(`${id}:${domain}`),
    });

    const id = createId("com");
    const bare = createId("com");

    await run(companies.create(alice, { id, name: "Northwind", domain: "northwind.io" }));
    await run(companies.create(alice, { id: bare, name: "Bare", domain: null }));
    queued.length = 0;

    expect(await run(companies.enrich(alice, id))).toEqual({ queued: true });
    expect(await run(companies.enrich(alice, bare))).toEqual({ queued: false });
    expect(await outcome(companies.enrich(bob, id))).toBe("NotFound");
    expect(queued).toEqual([`${id}:northwind.io`]);
  });
});

describe("contacts", () => {
  test("create defaults the owner to the creator and checks the company", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const other = await withCompany(env, bob);
    const id = createId("ctc");

    await run(
      env.records.contacts.create(alice, {
        id,
        first_name: " Priya ",
        last_name: "Raghunathan",
        email: "PRIYA@northwind.io",
        company_id: companyId,
      }),
    );

    expect(env.table("contact").get(id)).toMatchObject({
      workspaceId: "ws_a",
      firstName: "Priya",
      lastName: "Raghunathan",
      email: "priya@northwind.io",
      companyId,
      ownerId: "user_alice",
    });

    expect(
      await outcome(
        env.records.contacts.create(alice, {
          id: createId("ctc"),
          first_name: "X",
          company_id: other,
        }),
      ),
    ).toBe("Invalid");
  });

  test("only the caller's workspace can change or delete a contact", async () => {
    const env = setup();
    const id = createId("ctc");

    await run(env.records.contacts.create(alice, { id, first_name: "Priya" }));

    expect(await outcome(env.records.contacts.update(bob, id, { title: "Spy" }))).toBe("NotFound");
    expect(await outcome(env.records.contacts.remove(bob, id))).toBe("NotFound");

    await run(
      env.records.contacts.update(alice, id, {
        title: "VP of Engineering",
        seniority: "Executive",
      }),
    );
    expect(env.table("contact").get(id)).toMatchObject({
      title: "VP of Engineering",
      seniority: "Executive",
    });
  });
});

const ben = (companyId: string) => ({
  first_name: "Ben",
  last_name: "Tossell",
  company_id: companyId,
});

describe("duplicate contacts", () => {
  test("a member's duplicate is refused; a search result merges into the contact already there", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const first = createId("ctc");

    await run(env.records.contacts.create(alice, { id: first, ...ben(companyId) }));

    expect(
      await outcome(
        env.records.contacts.create(alice, {
          id: createId("ctc"),
          ...ben(companyId),
          first_name: "Benjamin",
        }),
      ),
    ).toBe("Invalid");

    const again = await run(
      env.records.contacts.create(alice, {
        id: createId("ctc"),
        ...ben(companyId),
        title: "Founder",
        linkedin_url: "https://www.linkedin.com/in/ben-tossell-70453537",
        source: "search",
      }),
    );

    expect(again).toMatchObject({ id: first, created: false, duplicate: "name" });
    expect(env.table("contact").size).toBe(1);
    // Empty fields fill in; nothing a member typed is replaced.
    expect(env.table("contact").get(first)).toMatchObject({
      firstName: "Ben",
      title: "Founder",
      linkedinUrl: "https://www.linkedin.com/in/ben-tossell-70453537",
    });

    // The same profile matches at any company, even without a last name.
    const elsewhere = await run(
      env.records.contacts.create(
        alice,
        {
          id: createId("ctc"),
          first_name: "B",
          linkedin_url: "https://uk.linkedin.com/in/Ben-Tossell-70453537/",
        },
        { onDuplicate: "merge" },
      ),
    );

    expect(elsewhere).toMatchObject({ id: first, created: false, duplicate: "linkedin" });
  });

  test("two people adding the same person at once make one contact", async () => {
    const env = setup();
    const companyId = await withCompany(env);

    const [chat, research] = await Promise.all([
      run(env.records.contacts.create(alice, { id: createId("ctc"), ...ben(companyId) })),
      run(
        env.records.contacts.create(alice, {
          id: createId("ctc"),
          ...ben(companyId),
          source: "search",
        }),
      ),
    ]);

    expect(chat.created).toBe(true);
    expect(research).toMatchObject({ id: chat.id, created: false });
    expect(env.table("contact").size).toBe(1);
  });

  test("namesakes at other companies, other workspaces and other profiles stay separate", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const other = await withCompany(env);
    const theirs = await withCompany(env, bob);

    await run(
      env.records.contacts.create(alice, {
        id: createId("ctc"),
        ...ben(companyId),
        linkedin_url: "https://www.linkedin.com/in/ben-1",
      }),
    );

    for (const [actor, input] of [
      [alice, { ...ben(other) }],
      [alice, { ...ben(companyId), linkedin_url: "https://www.linkedin.com/in/ben-2" }],
      [bob, { ...ben(theirs), linkedin_url: "https://www.linkedin.com/in/ben-1" }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each create checks the rows before it.
      const result = await run(
        env.records.contacts.create(actor, { id: createId("ctc"), ...input }),
      );

      expect(result.created).toBe(true);
    }
  });
});

describe("deals", () => {
  test("a new deal starts its research once it is saved; a refused one doesn't", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const started: string[] = [];

    const records = makeRecords(env.store, () => env.at, undefined, {
      dealCreated: (actor, id) => started.push(`${actor.userId} ${id}`),
    });

    const id = createId("del");

    await run(records.deals.create(alice, { id, name: "Pilot", company_id: companyId }));

    expect(
      await outcome(records.deals.create(alice, { id, name: "Pilot", company_id: companyId })),
    ).toBe("Invalid");
    expect(started).toEqual([`user_alice ${id}`]);
  });

  test("a stage change stamps the time, closes won deals and logs a stage change", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const id = createId("del");

    await run(
      env.records.deals.create(alice, {
        id,
        name: "Northwind — Platform rollout",
        company_id: companyId,
        amount: "$186,000",
        expected_close_date: "2026-08-29",
      }),
    );

    expect(env.table("deal").get(id)).toMatchObject({
      stage: "demo_booked",
      amount: "186000.00",
      currency: "USD",
      ownerId: "user_alice",
      expectedCloseDate: "2026-08-29",
    });

    await run(env.records.deals.update(alice, id, { stage: "closed_won" }));

    expect(env.table("deal").get(id)).toMatchObject({
      stage: "closed_won",
      stageChangedAt: env.at,
      closedAt: env.at,
      lastActivityAt: env.at,
    });

    const logged = [...env.table("activity").values()];

    expect(logged).toMatchObject([
      {
        type: "stage_change",
        dealId: id,
        companyId,
        meta: { from: "demo_booked", to: "closed_won" },
      },
    ]);
    expect(env.rows().get(companyId)?.["lastActivityAt"]).toEqual(env.at);
  });

  test("losing a deal needs a reason; reopening clears the close", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const id = createId("del");

    await run(env.records.deals.create(alice, { id, name: "Pilot", company_id: companyId }));

    expect(await outcome(env.records.deals.update(alice, id, { stage: "closed_lost" }))).toBe(
      "Invalid",
    );

    await run(
      env.records.deals.update(alice, id, { stage: "closed_lost", closed_reason: "Price" }),
    );
    expect(env.table("deal").get(id)).toMatchObject({ closedReason: "Price" });

    await run(env.records.deals.update(alice, id, { stage: "qualified_to_buy" }));
    expect(env.table("deal").get(id)).toMatchObject({ closedAt: null, closedReason: null });
  });

  test("contacts go on a deal with a role, and come off it", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const dealId = createId("del");
    const contactId = createId("ctc");

    await run(
      env.records.deals.create(alice, { id: dealId, name: "Pilot", company_id: companyId }),
    );
    await run(env.records.contacts.create(alice, { id: contactId, first_name: "Priya" }));

    await run(env.records.deals.attachContact(alice, dealId, contactId, "Champion"));
    expect([...env.dealContacts().values()]).toEqual([
      { dealId, contactId, workspaceId: "ws_a", role: "Champion" },
    ]);

    expect(await outcome(env.records.deals.attachContact(bob, dealId, contactId, null))).toBe(
      "NotFound",
    );

    await run(env.records.deals.detachContact(alice, dealId, contactId));
    expect(env.dealContacts().size).toBe(0);
  });
});

describe("activities", () => {
  test("a note on a contact also shows on their company and moves last activity forward", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const contactId = createId("ctc");
    const id = createId("act");

    await run(
      env.records.contacts.create(alice, {
        id: contactId,
        first_name: "Priya",
        company_id: companyId,
      }),
    );
    await run(
      env.records.activities.create(alice, {
        id,
        type: "call",
        body: "Wants the security review booked first.",
        contact_id: contactId,
      }),
    );

    expect(env.table("activity").get(id)).toMatchObject({
      type: "call",
      contactId,
      companyId,
      createdById: "user_alice",
    });
    expect(env.table("contact").get(contactId)?.["lastActivityAt"]).toEqual(env.at);
    expect(env.rows().get(companyId)?.["lastActivityAt"]).toEqual(env.at);
  });

  test("tasks complete and reopen; members can't log what the CRM writes", async () => {
    const env = setup();
    const companyId = await withCompany(env);
    const id = createId("act");

    await run(
      env.records.activities.create(alice, {
        id,
        type: "task",
        subject: "Send revised MSA",
        due_at: "2026-11-22T09:12:00Z",
        company_id: companyId,
      }),
    );
    await run(env.records.activities.update(alice, id, { completed: true }));
    expect(env.table("activity").get(id)?.["completedAt"]).toEqual(env.at);

    await run(env.records.activities.update(alice, id, { completed: false }));
    expect(env.table("activity").get(id)?.["completedAt"]).toBeNull();

    expect(
      await outcome(
        env.records.activities.create(alice, {
          id: createId("act"),
          type: "stage_change",
          subject: "x",
          company_id: companyId,
        }),
      ),
    ).toBe("Invalid");
    expect(
      await outcome(
        env.records.activities.create(alice, { id: createId("act"), type: "note", subject: "x" }),
      ),
    ).toBe("Invalid");
  });
});
