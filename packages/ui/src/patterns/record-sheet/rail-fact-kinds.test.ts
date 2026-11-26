import { describe, expect, it } from "bun:test";

import { orderFacts, type RailFactKind } from "./rail-fact-kinds";

function labels(facts: readonly { label: string }[]): string[] {
  return facts.map((fact) => fact.label);
}

function factsOf(...pairs: [string, RailFactKind][]) {
  return pairs.map(([label, kind]) => ({ label, kind }));
}

describe("orderFacts", () => {
  it("puts the groups in the standard order", () => {
    expect(
      labels(
        orderFacts(
          factsOf(
            ["Last submission", "date"],
            ["Next due", "due"],
            ["Controls", "count"],
            ["Area", "property"],
            ["Owner", "person"],
            ["Status", "status"],
            ["Code", "code"],
          ),
        ),
      ),
    ).toEqual(["Code", "Status", "Owner", "Area", "Controls", "Next due", "Last submission"]);
  });

  it("keeps the given order of the facts in one group", () => {
    expect(
      labels(
        orderFacts(
          factsOf(
            ["Frequency", "property"],
            ["Set by", "property"],
            ["Approver", "person"],
            ["Area", "property"],
            ["Owner", "person"],
            ["Added", "date"],
            ["Changed", "date"],
          ),
        ),
      ),
    ).toEqual(["Approver", "Owner", "Frequency", "Set by", "Area", "Added", "Changed"]);
  });

  it("puts a due date before the other dates", () => {
    expect(
      labels(
        orderFacts(
          factsOf(["Published", "date"], ["Review due", "due"], ["Requirements", "count"]),
        ),
      ),
    ).toEqual(["Requirements", "Review due", "Published"]);
  });

  it("does not change the input", () => {
    const input = factsOf(["Added", "date"], ["Code", "code"]);

    orderFacts(input);

    expect(labels(input)).toEqual(["Added", "Code"]);
  });
});
