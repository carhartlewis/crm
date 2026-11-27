import { describe, expect, test } from "bun:test";
import { EMPTY_VALUE_COLUMNS } from "@crm/core/fields";
import { fieldFacetValue, fieldSortValue, fieldText } from "./field-format.ts";

const labels = (id: string) => (id === "fop_1" ? "AWS" : null);
const names = (id: string) => (id === "user_1" ? "Priya" : null);

describe("fieldText", () => {
  test("reads each type", () => {
    expect(
      fieldText({ type: "select" }, { ...EMPTY_VALUE_COLUMNS, option_id: "fop_1" }, labels, names),
    ).toBe("AWS");
    expect(
      fieldText({ type: "user" }, { ...EMPTY_VALUE_COLUMNS, user_id: "user_1" }, labels, names),
    ).toBe("Priya");
    expect(
      fieldText({ type: "checkbox" }, { ...EMPTY_VALUE_COLUMNS, bool: false }, labels, names),
    ).toBe("No");
    expect(
      fieldText({ type: "number" }, { ...EMPTY_VALUE_COLUMNS, number: "1250.5" }, labels, names),
    ).toBe("1,250.5");
    expect(fieldText({ type: "text" }, undefined, labels, names)).toBeNull();
  });
});

describe("sort and facets", () => {
  test("numbers sort as numbers; blanks filter as none", () => {
    expect(fieldSortValue({ type: "number" }, { ...EMPTY_VALUE_COLUMNS, number: "9" }, "9")).toBe(
      9,
    );
    expect(fieldFacetValue({ type: "select" }, undefined)).toBe("none");
    expect(fieldFacetValue({ type: "checkbox" }, { ...EMPTY_VALUE_COLUMNS, bool: true })).toBe(
      "yes",
    );
  });
});
