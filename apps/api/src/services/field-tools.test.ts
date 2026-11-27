import { describe, expect, test } from "bun:test";
import { createId } from "@crm/core/ids";
import { Effect } from "effect";
import { createMemoryFieldStore } from "./field-store-memory.ts";
import { fieldTools } from "./field-tools.ts";
import type { LocalTool } from "@crm/integrations/gateway";
import { makeFields } from "./Fields.ts";

const company = createId("com");

type ToolArgs = Parameters<LocalTool["call"]>[0];

function setup() {
  const memory = createMemoryFieldStore({
    members: ["ws_a:user_alice"],
    records: [`company:ws_a:${company}`],
  });

  const fields = makeFields(memory.store);
  const tools = fieldTools(fields, { userId: "user_alice", workspaceId: "ws_a" });

  const call = (name: string, args: ToolArgs) => {
    const found = tools.find((entry) => entry.tool.name === name);

    if (!found) throw new Error(`No tool ${name}`);

    return found.call(args);
  };

  return { memory, fields, tools, call };
}

/** A tool result's JSON text. */
function textOf(result: Awaited<ReturnType<LocalTool["call"]>>) {
  const [first] = result.content;

  return first?.type === "text" ? first.text : "";
}

describe("field tools", () => {
  test("list is read-only, set is a write", () => {
    const { tools } = setup();

    expect(tools.map((entry) => [entry.tool.name, entry.tool.annotations?.readOnlyHint])).toEqual([
      ["crm__list_fields", true],
      ["crm__set_field_value", false],
    ]);
  });

  test("the agent lists fields and fills one by key", async () => {
    const { memory, fields, call } = setup();
    const id = createId("fdf");

    await Effect.runPromise(
      fields.create(
        { userId: "user_alice", activeWorkspaceId: "ws_a" },
        { id, entity: "company", label: "Seats", type: "number", agent_brief: "Paid seats." },
      ),
    );

    const listed = await call("crm__list_fields", { entity: "company" });

    expect(JSON.parse(textOf(listed))).toMatchObject({
      entity: "company",
      fields: [{ key: "seats", brief: "Paid seats.", agentFilled: true }],
    });

    const set = await call("crm__set_field_value", {
      entity: "company",
      field: "seats",
      record_id: company,
      value: 120,
    });

    expect(set.isError).toBeUndefined();
    expect([...memory.values().values()]).toMatchObject([{ number: "120", setBy: "agent" }]);

    const bad = await call("crm__set_field_value", {
      entity: "company",
      field: "seats",
      record_id: company,
      value: "many",
    });

    expect(bad).toMatchObject({ isError: true });
  });
});
