import { describe, expect, test } from "bun:test";
import { Cause, Effect, Exit, Option, References } from "effect";
import { authorizeWorkspace, parseCompanyPatch, parseNewCompany } from "./companies-rules.ts";
import { type Actor, makeCompanies } from "./Companies.ts";
import { createMemoryCompanyStore } from "./company-store-memory.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const bob: Actor = { userId: "user_bob", activeWorkspaceId: "ws_b" };

function setup() {
  const memory = createMemoryCompanyStore(["ws_a:user_alice", "ws_b:user_bob"]);

  return { ...memory, companies: makeCompanies(memory.store) };
}

/** The failure's tag, "Die" for a defect, or "Success". */
async function outcome<A, E extends object>(effect: Effect.Effect<A, E>) {
  // Store failures are logged by design; keep test output quiet.
  const exit = await Effect.runPromiseExit(
    Effect.provideService(effect, References.MinimumLogLevel, "None"),
  );

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    // Error classes are named after their tag (NotFound, Invalid, NoActiveWorkspace).
    onSome: (error) => error.constructor.name,
  });
}

describe("authorizeWorkspace", () => {
  test("allows only the active workspace, and only for a member", () => {
    expect(authorizeWorkspace({ activeWorkspaceId: "ws_a", isMember: true })).toEqual({
      ok: true,
      value: "ws_a",
    });
    expect(authorizeWorkspace({ activeWorkspaceId: null, isMember: true }).ok).toBe(false);
    expect(authorizeWorkspace({ activeWorkspaceId: "ws_a", isMember: false }).ok).toBe(false);
  });

  test("a requested workspace must be the active one; a missing one is refused", () => {
    const base = { activeWorkspaceId: "ws_a", isMember: true };

    expect(authorizeWorkspace({ ...base, requested: "ws_a" }).ok).toBe(true);
    expect(authorizeWorkspace({ ...base, requested: "ws_b" }).ok).toBe(false);
    expect(authorizeWorkspace({ ...base, requested: null }).ok).toBe(false);
  });
});

describe("company input", () => {
  const id = crypto.randomUUID();

  test("normalises name and domain on create", () => {
    expect(parseNewCompany({ id, name: "  Acme  Inc ", domain: "https://www.ACME.com/x" })).toEqual(
      { ok: true, value: { id, name: "Acme Inc", domain: "acme.com" } },
    );
    expect(parseNewCompany({ id: "not-a-uuid", name: "Acme", domain: null }).ok).toBe(false);
    expect(parseNewCompany({ id, name: " ", domain: null }).ok).toBe(false);
    expect(parseNewCompany({ id, name: "Acme", domain: "acme" }).ok).toBe(false);
  });

  test("a patch keeps absent fields absent and clears a blank domain", () => {
    expect(parseCompanyPatch({})).toEqual({ ok: true, value: {} });
    expect(parseCompanyPatch({ domain: "" })).toEqual({ ok: true, value: { domain: null } });
    expect(parseCompanyPatch({ name: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("companies", () => {
  test("create writes to the active workspace, owned by the creator, and returns the txid", async () => {
    const { companies, rows } = setup();
    const id = crypto.randomUUID();

    const result = await Effect.runPromise(
      companies.create(alice, { id, name: " Acme ", domain: "WWW.acme.com" }),
    );

    expect(result.txid).toBe(1001);
    expect(rows().get(id)).toMatchObject({
      workspaceId: "ws_a",
      ownerId: "user_alice",
      name: "Acme",
      domain: "acme.com",
    });
  });

  test("no active workspace, or not a member of it, is NoActiveWorkspace and writes nothing", async () => {
    const { companies, rows } = setup();
    const input = { id: crypto.randomUUID(), name: "Acme", domain: null };

    expect(await outcome(companies.create({ ...alice, activeWorkspaceId: null }, input))).toBe(
      "NoActiveWorkspace",
    );
    expect(await outcome(companies.create({ ...alice, activeWorkspaceId: "ws_b" }, input))).toBe(
      "NoActiveWorkspace",
    );
    expect(rows().size).toBe(0);
  });

  test("bad input is Invalid before touching the store", async () => {
    const { companies } = setup();

    expect(await outcome(companies.create(alice, { id: "x", name: "Acme", domain: null }))).toBe(
      "Invalid",
    );
    expect(await outcome(companies.update(alice, crypto.randomUUID(), { name: "" }))).toBe(
      "Invalid",
    );
  });

  test("a reused id is Invalid, even from another workspace", async () => {
    const { companies } = setup();
    const id = crypto.randomUUID();

    await Effect.runPromise(companies.create(alice, { id, name: "Acme", domain: null }));

    expect(await outcome(companies.create(bob, { id, name: "Other", domain: null }))).toBe(
      "Invalid",
    );
  });

  test("update and delete only reach rows in the caller's workspace", async () => {
    const { companies, rows } = setup();
    const id = crypto.randomUUID();

    await Effect.runPromise(companies.create(alice, { id, name: "Acme", domain: null }));

    expect(await outcome(companies.update(bob, id, { name: "Stolen" }))).toBe("NotFound");
    expect(await outcome(companies.remove(bob, id))).toBe("NotFound");
    expect(rows().get(id)?.name).toBe("Acme");

    const updated = await Effect.runPromise(
      companies.update(alice, id, { name: "Acme Ltd", domain: "acme.io" }),
    );

    expect(updated.txid).toBeGreaterThan(1001);
    expect(rows().get(id)).toMatchObject({ name: "Acme Ltd", domain: "acme.io" });

    await Effect.runPromise(companies.remove(alice, id));
    expect(rows().has(id)).toBe(false);
    expect(await outcome(companies.remove(alice, id))).toBe("NotFound");
  });

  test("an empty patch still writes (touches updated_at) so the txid reaches the shape", async () => {
    let time = 1;
    const memory = createMemoryCompanyStore(["ws_a:user_alice"], () => time);
    const companies = makeCompanies(memory.store);
    const id = crypto.randomUUID();

    await Effect.runPromise(companies.create(alice, { id, name: "Acme", domain: null }));
    time = 2;
    await Effect.runPromise(companies.update(alice, id, {}));

    expect(memory.rows().get(id)?.updatedAt).toBe(2);
  });

  test("a malformed id is NotFound, not a server error", async () => {
    const { companies } = setup();

    expect(await outcome(companies.remove(alice, "../etc"))).toBe("NotFound");
  });

  test("the shape workspace must be the active one with a membership", async () => {
    const { companies } = setup();

    expect(await Effect.runPromise(companies.workspaceFor(alice, "ws_a"))).toBe("ws_a");
    expect(await outcome(companies.workspaceFor(alice, "ws_b"))).toBe("NoActiveWorkspace");
    expect(await outcome(companies.workspaceFor(alice, null))).toBe("NoActiveWorkspace");
    expect(
      await outcome(companies.workspaceFor({ ...alice, activeWorkspaceId: "ws_b" }, "ws_b")),
    ).toBe("NoActiveWorkspace");
  });

  test("a store failure is a defect (500), never a typed client error", async () => {
    const companies = makeCompanies({
      isMember: async () => {
        throw new Error("db down");
      },
      transact: async () => {
        throw new Error("db down");
      },
    });

    expect(
      await outcome(companies.create(alice, { id: crypto.randomUUID(), name: "A", domain: null })),
    ).toBe("Die");
  });
});
