import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Effect } from "effect";
import { makeCompanies } from "./Companies.ts";
import { nextPrimary } from "./primary-contact.ts";
import { createMemoryRecordStore } from "./record-store-memory.ts";
import type { Actor } from "./record-writes.ts";
import { makeRecords } from "./Records.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

function setup() {
  const memory = createMemoryRecordStore(["ws_a:user_alice"]);
  const records = makeRecords(memory.store, () => new Date("2026-11-26T12:00:00Z"));
  const companies = makeCompanies(memory.store);

  const company = async (name: string) => {
    const id = createId("com");

    await run(companies.create(alice, { id, name, domain: null }));

    return id;
  };

  const contact = async (first: string, companyId?: string) => {
    const id = createId("ctc");

    const input = companyId
      ? { id, first_name: first, company_id: companyId }
      : { id, first_name: first };

    await run(records.contacts.create(alice, input));

    return id;
  };

  /** Stamps a contact's last activity, as logging an activity would. */
  const activeAt = (id: string, at: string) => {
    const table = memory.table("contact");

    table.set(id, { ...table.get(id), lastActivityAt: new Date(at) });
  };

  const primaryOf = (companyId: string) => memory.rows().get(companyId)?.["primaryContactId"];

  return { records, company, contact, activeAt, primaryOf };
}

describe("primary contact", () => {
  test("the first contact at a company becomes its primary; later ones don't", async () => {
    const env = setup();
    const northwind = await env.company("Northwind");
    const priya = await env.contact("Priya", northwind);

    await env.contact("Jonah", northwind);

    expect(env.primaryOf(northwind)).toBe(priya);
  });

  test("a contact moved to a company without a primary becomes it", async () => {
    const env = setup();
    const northwind = await env.company("Northwind");
    const ana = await env.contact("Ana");

    expect(env.primaryOf(northwind) ?? null).toBeNull();

    await run(env.records.contacts.update(alice, ana, { company_id: northwind }));

    expect(env.primaryOf(northwind)).toBe(ana);
  });

  test("moving the primary away hands it to the most recently active contact there", async () => {
    const env = setup();
    const northwind = await env.company("Northwind");
    const acme = await env.company("Acme");
    const priya = await env.contact("Priya", northwind);
    const jonah = await env.contact("Jonah", northwind);
    const mei = await env.contact("Mei", northwind);

    env.activeAt(jonah, "2026-11-20T00:00:00Z");
    env.activeAt(mei, "2026-10-01T00:00:00Z");

    await run(env.records.contacts.update(alice, priya, { company_id: acme }));

    expect(env.primaryOf(northwind)).toBe(jonah);
    // The new company had none, so Priya leads there now.
    expect(env.primaryOf(acme)).toBe(priya);
  });

  test("archiving the primary hands it on; deleting the last one clears it", async () => {
    const env = setup();
    const northwind = await env.company("Northwind");
    const priya = await env.contact("Priya", northwind);
    const jonah = await env.contact("Jonah", northwind);

    await run(env.records.contacts.update(alice, priya, { archived: true }));
    expect(env.primaryOf(northwind)).toBe(jonah);

    await run(env.records.contacts.remove(alice, jonah));
    // Priya is archived, so no one is left.
    expect(env.primaryOf(northwind)).toBeNull();

    // Restored at a company without a primary, she takes it back.
    await run(env.records.contacts.update(alice, priya, { archived: false }));
    expect(env.primaryOf(northwind)).toBe(priya);
  });

  test("edits that don't move or archive the primary leave it", async () => {
    const env = setup();
    const northwind = await env.company("Northwind");
    const priya = await env.contact("Priya", northwind);
    const jonah = await env.contact("Jonah", northwind);

    await run(env.records.contacts.update(alice, priya, { title: "VP Engineering" }));
    await run(env.records.contacts.update(alice, jonah, { archived: true }));

    expect(env.primaryOf(northwind)).toBe(priya);
  });

  test("nextPrimary prefers recent activity, then the newest, and skips archived", () => {
    const rows = [
      { id: "a", archivedAt: null, lastActivityAt: null, createdAt: new Date("2026-01-01") },
      { id: "b", archivedAt: null, lastActivityAt: null, createdAt: new Date("2026-02-01") },
      {
        id: "c",
        archivedAt: new Date("2026-03-01"),
        lastActivityAt: new Date("2026-03-01"),
        createdAt: new Date("2026-01-01"),
      },
    ];

    expect(nextPrimary(rows, "x")).toBe("b");
    expect(nextPrimary(rows, "b")).toBe("a");
    expect(nextPrimary(rows.slice(2), "x")).toBeNull();
  });
});
