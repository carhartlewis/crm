import { describe, expect, it } from "bun:test";

import { type ColumnKind, orderColumns } from "./column-kinds";

function ids(columns: readonly { id: string }[]): string[] {
  return columns.map((column) => column.id);
}

function columnsOf(...pairs: [string, ColumnKind][]) {
  return pairs.map(([id, kind]) => ({ id, kind }));
}

describe("orderColumns", () => {
  it("puts the groups in the standard order", () => {
    expect(
      ids(
        orderColumns(
          columnsOf(
            ["actions", "action"],
            ["added", "date"],
            ["controls", "count"],
            ["domain", "text"],
            ["status", "status"],
            ["name", "title"],
            ["id", "code"],
          ),
        ),
      ),
    ).toEqual(["id", "name", "status", "domain", "controls", "added", "actions"]);
  });

  it("keeps the given order of the columns in one group", () => {
    expect(
      ids(
        orderColumns(
          columnsOf(
            ["name", "title"],
            ["email", "detail"],
            ["role", "short"],
            ["owner", "person"],
            ["area", "text"],
          ),
        ),
      ),
    ).toEqual(["name", "email", "role", "owner", "area"]);
  });

  it("puts progress with status, after status", () => {
    expect(
      ids(
        orderColumns(
          columnsOf(
            ["requirements", "count"],
            ["progress", "progress"],
            ["status", "status"],
            ["name", "title"],
          ),
        ),
      ),
    ).toEqual(["name", "status", "progress", "requirements"]);
  });

  it("does not change the input", () => {
    const input = columnsOf(["added", "date"], ["name", "title"]);

    orderColumns(input);

    expect(ids(input)).toEqual(["added", "name"]);
  });
});
