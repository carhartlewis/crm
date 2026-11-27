import { describe, expect, test } from "bun:test";
import { listResult, withoutRepeatedTable } from "./tool-results.ts";

const deal = {
  id: "del_1",
  name: "Northwind — Platform rollout",
  stage: "contract_sent",
  amount: "186000",
  currency: "USD",
  expectedCloseDate: "2026-08-29",
  companyId: "com_1",
  companyName: "Northwind Labs",
  ownerName: null,
  description: null,
  closedReason: null,
  lastActivityAt: null,
};

const mcp = (value: Readonly<Record<string, readonly (typeof deal)[]>>) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

describe("listResult", () => {
  test("reads a CRM list call's rows from the MCP text it answered", () => {
    expect(
      listResult({
        name: "connections__crm__list_deals",
        state: "completed",
        output: mcp({ deals: [deal] }),
      }),
    ).toMatchObject({
      kind: "deals",
      rows: [{ id: "del_1", amount: "186000", stage: "contract_sent" }],
    });
  });

  test("other tools, running calls, refusals and empty lists show no table", () => {
    expect(
      listResult({ name: "connections__crm__get_deal", state: "completed", output: deal }),
    ).toBeNull();
    expect(listResult({ name: "connections__crm__list_deals", state: "running" })).toBeNull();
    expect(
      listResult({
        name: "connections__crm__list_companies",
        state: "completed",
        output: { isError: true, content: [{ type: "text", text: "Invalid input" }] },
      }),
    ).toBeNull();
    expect(
      listResult({
        name: "connections__crm__list_contacts",
        state: "completed",
        output: mcp({ contacts: [] }),
      }),
    ).toBeNull();
  });

  test("structured content and plain JSON strings are read too", () => {
    const name = "connections__crm__list_deals";

    expect(
      listResult({ name, state: "completed", output: { structuredContent: { deals: [deal] } } })
        ?.rows,
    ).toHaveLength(1);
    expect(
      listResult({ name, state: "completed", output: JSON.stringify({ deals: [deal] }) })?.rows,
    ).toHaveLength(1);
  });
});

describe("withoutRepeatedTable", () => {
  test("drops the first table and keeps the words around it", () => {
    const reply = [
      "Two deals are open.",
      "",
      "| Deal | Stage |",
      "| --- | --- |",
      "| Northwind | Contract sent |",
      "| Ventana | Qualified |",
      "",
      "Northwind closes first.",
    ].join("\n");

    expect(withoutRepeatedTable(reply)).toBe("Two deals are open.\n\nNorthwind closes first.");
  });

  test("a reply without a table is unchanged", () => {
    expect(withoutRepeatedTable("A | B are both fine.")).toBe("A | B are both fine.");
  });
});
