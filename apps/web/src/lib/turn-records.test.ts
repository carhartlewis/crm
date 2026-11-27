import { describe, expect, test } from "bun:test";
import { callRecord, turnRecords } from "./turn-records.ts";

/** A CRM tool's answer as the MCP gateway wraps it. */
type Answer = Readonly<
  Record<string, string | boolean | readonly Readonly<Record<string, string>>[]>
>;

const mcp = (value: Answer) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

describe("callRecord", () => {
  test("a created deal is its id and the name it was given", () => {
    expect(
      callRecord({
        name: "connections__crm__create_deal",
        state: "completed",
        input: { name: "Mercury — New opportunity", company_id: "com_m" },
        output: mcp({ id: "del_a", created: true }),
      }),
    ).toEqual({ kind: "deal", id: "del_a", name: "Mercury — New opportunity" });
  });

  test("a created contact is named from first and last name", () => {
    expect(
      callRecord({
        name: "connections__crm__create_contact",
        state: "completed",
        input: { first_name: "Priya", last_name: "Raghunathan" },
        output: mcp({ id: "ctc_a", created: true }),
      })?.name,
    ).toBe("Priya Raghunathan");
  });

  test("a read is named from its answer; an update without a name has none", () => {
    expect(
      callRecord({
        name: "connections__crm__get_company",
        state: "completed",
        input: { id: "com_m" },
        output: mcp({ id: "com_m", name: "Mercury", domain: "mercury.com" }),
      }),
    ).toEqual({ kind: "company", id: "com_m", name: "Mercury" });
    expect(
      callRecord({
        name: "connections__crm__update_deal",
        state: "completed",
        input: { id: "del_a", stage: "won" },
        output: mcp({ id: "del_a", updated: true }),
      }),
    ).toEqual({ kind: "deal", id: "del_a", name: undefined });
  });

  test("an unfinished, failed or other call has no record", () => {
    const output = mcp({ id: "del_a", created: true });

    expect(
      callRecord({ name: "connections__crm__create_deal", state: "failed", output }),
    ).toBeNull();
    expect(
      callRecord({ name: "connections__crm__log_activity", state: "completed", output }),
    ).toBeNull();
    expect(
      callRecord({ name: "connections__crm__create_deal", state: "completed", output: "oops" }),
    ).toBeNull();
  });
});

describe("turnRecords", () => {
  test("writes, reads and list rows, once each, keeping a name a later call gives", () => {
    expect(
      turnRecords([
        {
          name: "connections__crm__list_deals",
          state: "completed",
          output: mcp({ deals: [{ id: "del_b", name: "Northwind", stage: "won" }] }),
        },
        {
          name: "connections__crm__update_deal",
          state: "completed",
          input: { id: "del_b" },
          output: mcp({ id: "del_b", updated: true }),
        },
        {
          name: "connections__crm__update_company",
          state: "completed",
          input: { id: "com_m" },
          output: mcp({ id: "com_m", updated: true }),
        },
        {
          name: "connections__crm__get_company",
          state: "completed",
          output: mcp({ id: "com_m", name: "Mercury" }),
        },
      ]),
    ).toEqual([
      { kind: "deal", id: "del_b", name: "Northwind" },
      { kind: "company", id: "com_m", name: "Mercury" },
    ]);
  });
});
