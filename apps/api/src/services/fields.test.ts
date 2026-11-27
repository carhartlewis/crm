import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Cause, Effect, Exit, Option, References } from "effect";
import { createMemoryFieldStore } from "./field-store-memory.ts";
import { makeFields } from "./Fields.ts";
import type { Actor } from "./record-writes.ts";

const alice: Actor = { userId: "user_alice", activeWorkspaceId: "ws_a" };
const bob: Actor = { userId: "user_bob", activeWorkspaceId: "ws_b" };
const stranger: Actor = { userId: "user_eve", activeWorkspaceId: "ws_a" };

const northwind = createId("com");
const priya = createId("ctc");

function setup() {
  const memory = createMemoryFieldStore({
    members: ["ws_a:user_alice", "ws_a:user_carol", "ws_b:user_bob"],
    records: [`company:ws_a:${northwind}`, `contact:ws_a:${priya}`],
  });

  return { ...memory, fields: makeFields(memory.store, () => new Date("2026-11-26T12:00:00Z")) };
}

async function outcome<A, E extends object>(effect: Effect.Effect<A, E>) {
  const exit = await Effect.runPromiseExit(
    Effect.provideService(effect, References.MinimumLogLevel, "None"),
  );

  if (Exit.isSuccess(exit)) return "Success";

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "Die",
    onSome: (error) => `${error.constructor.name}: ${"message" in error ? error.message : ""}`,
  });
}

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

async function selectField(env: ReturnType<typeof setup>, label = "Runs on") {
  const id = createId("fdf");

  const options = ["AWS", "Google Cloud", "Azure"].map((name) => ({
    id: createId("fop"),
    label: name,
  }));

  await run(env.fields.create(alice, { id, entity: "company", label, type: "select", options }));

  return { id, options };
}

describe("definitions", () => {
  test("create derives a unique key, appends, and stores options in order", async () => {
    const env = setup();
    const first = await selectField(env);
    const second = createId("fdf");

    await run(
      env.fields.create(alice, { id: second, entity: "company", label: "Runs-on!", type: "text" }),
    );

    expect(env.definitions().get(first.id)).toMatchObject({
      key: "runs_on",
      position: 0,
      agentFilled: true,
      showOnSheet: true,
      showOnTable: false,
    });
    expect(env.definitions().get(second)).toMatchObject({ key: "runs_on_2", position: 1 });
    expect([...env.options().values()].map((option) => [option.label, option.position])).toEqual([
      ["AWS", 0],
      ["Google Cloud", 1],
      ["Azure", 2],
    ]);
  });

  test("create refuses bad types, duplicate labels, options on non-selects and strangers", async () => {
    const env = setup();
    await selectField(env);

    const base = { entity: "company", label: "Seats", type: "number" };

    expect(
      await outcome(env.fields.create(alice, { ...base, id: createId("fdf"), type: "money" })),
    ).toStartWith("Invalid");
    expect(
      await outcome(env.fields.create(alice, { ...base, id: createId("fdf"), label: "runs ON" })),
    ).toBe("Invalid: There is already a field called runs ON");
    expect(
      await outcome(
        env.fields.create(alice, {
          ...base,
          id: createId("fdf"),
          options: [{ id: createId("fop"), label: "x" }],
        }),
      ),
    ).toBe("Invalid: Only select fields have options");
    expect(
      await outcome(
        env.fields.create(alice, { ...base, id: createId("fdf"), type: "select", options: [] }),
      ),
    ).toBe("Invalid: Add at least one option");
    expect(
      await outcome(env.fields.create(stranger, { ...base, id: createId("fdf") })),
    ).toStartWith("NoActiveWorkspace");
  });

  test("archive keeps values; restore moves the field to the end", async () => {
    const env = setup();
    const runsOn = await selectField(env);
    const seats = createId("fdf");

    await run(
      env.fields.create(alice, { id: seats, entity: "company", label: "Seats", type: "number" }),
    );
    await run(
      env.fields.putValue(alice, {
        field_id: runsOn.id,
        record_id: northwind,
        value: runsOn.options[0]?.id ?? null,
      }),
    );
    await run(env.fields.update(alice, runsOn.id, { archived: true }));

    expect(env.definitions().get(runsOn.id)?.archivedAt).toEqual(new Date("2026-11-26T12:00:00Z"));
    expect(env.values().size).toBe(1);

    await run(env.fields.update(alice, runsOn.id, { archived: false, label: "Cloud" }));

    expect(env.definitions().get(runsOn.id)).toMatchObject({
      archivedAt: null,
      position: 2,
      label: "Cloud",
      key: "runs_on",
    });
  });

  test("another workspace can't see or change the field", async () => {
    const env = setup();
    const { id } = await selectField(env);

    expect(await outcome(env.fields.update(bob, id, { label: "Mine" }))).toBe(
      "NotFound: Field not found",
    );
  });

  test("reorder sets positions and refuses fields from elsewhere", async () => {
    const env = setup();
    const a = await selectField(env, "A");
    const b = await selectField(env, "B");

    await run(env.fields.reorder(alice, "company", [b.id, a.id]));

    expect(env.definitions().get(b.id)?.position).toBe(0);
    expect(env.definitions().get(a.id)?.position).toBe(1);
    expect(await outcome(env.fields.reorder(alice, "contact", [a.id]))).toBe(
      "Invalid: That field is not in this list",
    );
  });

  test("options: add, rename, archive, reorder", async () => {
    const env = setup();
    const { id, options } = await selectField(env);
    const onPrem = createId("fop");

    await run(env.fields.createOption(alice, id, { id: onPrem, label: "On-prem" }));
    expect(env.options().get(onPrem)?.position).toBe(3);

    expect(
      await outcome(env.fields.createOption(alice, id, { id: createId("fop"), label: "aws" })),
    ).toBe('Invalid: "aws" is already an option');

    const [aws, gcp] = options;

    await run(env.fields.updateOption(alice, id, gcp?.id ?? "", { label: "GCP" }));
    await run(env.fields.updateOption(alice, id, aws?.id ?? "", { archived: true }));
    await run(env.fields.reorderOptions(alice, id, [onPrem, gcp?.id ?? ""]));

    expect(env.options().get(gcp?.id ?? "")).toMatchObject({ label: "GCP", position: 1 });
    expect(env.options().get(aws?.id ?? "")?.archivedAt).not.toBeNull();
    expect(env.options().get(onPrem)?.position).toBe(0);
  });
});

describe("values", () => {
  test("put inserts with the client's id, updates in place, and null clears", async () => {
    const env = setup();
    const seats = createId("fdf");
    const valueId = createId("fvl");

    await run(
      env.fields.create(alice, { id: seats, entity: "company", label: "Seats", type: "number" }),
    );
    await run(
      env.fields.putValue(alice, {
        id: valueId,
        field_id: seats,
        record_id: northwind,
        value: "1,200",
      }),
    );

    expect(env.values().get(valueId)).toMatchObject({ number: "1200", setBy: "member" });

    await run(
      env.fields.putValue(alice, {
        id: createId("fvl"),
        field_id: seats,
        record_id: northwind,
        value: 40,
      }),
    );

    expect([...env.values().keys()]).toEqual([valueId]);
    expect(env.values().get(valueId)?.number).toBe("40");

    await run(env.fields.putValue(alice, { field_id: seats, record_id: northwind, value: null }));

    expect(env.values().size).toBe(0);
  });

  test("the record must be in the workspace and match the field's entity", async () => {
    const env = setup();
    const seats = createId("fdf");

    await run(
      env.fields.create(alice, { id: seats, entity: "company", label: "Seats", type: "number" }),
    );

    expect(
      await outcome(env.fields.putValue(alice, { field_id: seats, record_id: priya, value: 3 })),
    ).toBe("Invalid: That company is not in this workspace");
    expect(
      await outcome(
        env.fields.putValue(alice, { field_id: seats, record_id: northwind, value: "lots" }),
      ),
    ).toBe("Invalid: Seats: Enter a number");
  });

  test("select values must be the field's live options; user values must be members", async () => {
    const env = setup();
    const runsOn = await selectField(env);
    const other = await selectField(env, "Other");
    const owner = createId("fdf");

    await run(
      env.fields.create(alice, { id: owner, entity: "company", label: "BDR owner", type: "user" }),
    );

    expect(
      await outcome(
        env.fields.putValue(alice, {
          field_id: runsOn.id,
          record_id: northwind,
          value: other.options[0]?.id ?? null,
        }),
      ),
    ).toBe("Invalid: Runs on: choose one of its options");
    expect(
      await outcome(
        env.fields.putValue(alice, { field_id: owner, record_id: northwind, value: "user_bob" }),
      ),
    ).toBe("Invalid: BDR owner: choose a member of this workspace");
    expect(
      await outcome(
        env.fields.putValue(alice, { field_id: owner, record_id: northwind, value: "user_carol" }),
      ),
    ).toBe("Success");
  });

  test("a required field can't be cleared", async () => {
    const env = setup();
    const id = createId("fdf");

    await run(
      env.fields.create(alice, {
        id,
        entity: "contact",
        label: "Persona",
        type: "text",
        required: true,
      }),
    );
    await run(env.fields.putValue(alice, { field_id: id, record_id: priya, value: "Champion" }));

    expect(
      await outcome(env.fields.putValue(alice, { field_id: id, record_id: priya, value: "" })),
    ).toBe("Invalid: Persona is required");
  });
});

describe("agent", () => {
  test("lists live fields with options, briefs and a record's values", async () => {
    const env = setup();
    const runsOn = await selectField(env);

    await run(env.fields.update(alice, runsOn.id, { agent_brief: "Their production cloud." }));
    await run(
      env.fields.putValue(alice, {
        field_id: runsOn.id,
        record_id: northwind,
        value: runsOn.options[1]?.id ?? null,
      }),
    );

    const listed = await run(env.fields.agentList(alice, "company", northwind));

    expect(listed).toEqual([
      {
        id: runsOn.id,
        key: "runs_on",
        label: "Runs on",
        type: "select",
        agentFilled: true,
        brief: "Their production cloud.",
        required: false,
        options: ["AWS", "Google Cloud", "Azure"],
        value: "Google Cloud",
        setBy: "member",
      },
    ]);
  });

  test("sets by key and option label, marks set_by agent, and respects members", async () => {
    const env = setup();
    const runsOn = await selectField(env);

    await run(
      env.fields.agentSet(alice, {
        entity: "company",
        field: "runs_on",
        record_id: northwind,
        value: "azure",
      }),
    );

    const [value] = env.values().values();

    expect(value).toMatchObject({ optionId: runsOn.options[2]?.id, setBy: "agent" });

    expect(
      await outcome(
        env.fields.agentSet(alice, {
          entity: "company",
          field: "runs_on",
          record_id: northwind,
          value: "Oracle",
        }),
      ),
    ).toBe('Invalid: Runs on: "Oracle" is not one of its options');

    await run(
      env.fields.putValue(alice, {
        field_id: runsOn.id,
        record_id: northwind,
        value: runsOn.options[0]?.id ?? null,
      }),
    );

    expect(
      await outcome(
        env.fields.agentSet(alice, { field: runsOn.id, record_id: northwind, value: "Azure" }),
      ),
    ).toStartWith("Invalid: A member set Runs on");
    expect(
      await outcome(
        env.fields.agentSet(alice, {
          field: runsOn.id,
          record_id: northwind,
          value: "Azure",
          replace_member_value: true,
        }),
      ),
    ).toBe("Success");
  });

  test("refuses fields that are members-only", async () => {
    const env = setup();
    const id = createId("fdf");

    await run(
      env.fields.create(alice, {
        id,
        entity: "company",
        label: "Notes",
        type: "text",
        agent_filled: false,
      }),
    );

    expect(
      await outcome(env.fields.agentSet(alice, { field: id, record_id: northwind, value: "x" })),
    ).toBe("Invalid: Notes is filled by members only");
  });
});
