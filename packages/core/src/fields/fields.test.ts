import { describe, expect, test } from "bun:test";
import { createId } from "../ids/index.ts";
import {
  fieldKey,
  normalizeFieldLabel,
  normalizeFieldValue,
  normalizeOptionLabels,
  optionalNumber,
  readFieldValue,
  STANDARD_FIELDS,
  SUGGESTED_FIELDS,
  valueColumns,
} from "./index.ts";

describe("fieldKey", () => {
  test("snake_cases the label", () => {
    expect(fieldKey("Lead source")).toBe("lead_source");
    expect(fieldKey("  ICP fit score! ")).toBe("icp_fit_score");
    expect(fieldKey("Café owner")).toBe("cafe_owner");
  });

  test("starts with a letter and never comes out empty", () => {
    expect(fieldKey("2024 budget")).toBe("field_2024_budget");
    expect(fieldKey("!!!")).toBe("field");
  });

  test("adds a number when the key is taken", () => {
    expect(fieldKey("Segment", ["segment"])).toBe("segment_2");
    expect(fieldKey("Segment", ["segment", "segment_2"])).toBe("segment_3");
  });

  test("stays within 48 characters, suffix included", () => {
    const label = "a".repeat(60);
    const key = fieldKey(label, [fieldKey(label)]);

    expect(fieldKey(label)).toHaveLength(48);
    expect(key).toHaveLength(48);
    expect(key.endsWith("_2")).toBe(true);
  });
});

describe("labels and options", () => {
  test("labels collapse whitespace and are required", () => {
    expect(normalizeFieldLabel("  Runs   on ")).toEqual({ ok: true, value: "Runs on" });
    expect(normalizeFieldLabel(" ").ok).toBe(false);
    expect(normalizeFieldLabel("x".repeat(81)).ok).toBe(false);
  });

  test("options drop blanks and refuse duplicates", () => {
    expect(normalizeOptionLabels(["AWS", " ", "Azure "])).toEqual({
      ok: true,
      value: ["AWS", "Azure"],
    });
    expect(normalizeOptionLabels(["AWS", "aws"])).toEqual({
      ok: false,
      message: '"aws" is listed twice',
    });
    expect(normalizeOptionLabels([" "]).ok).toBe(false);
  });
});

describe("normalizeFieldValue", () => {
  test("numbers are decimal text", () => {
    expect(optionalNumber("1,250.50")).toEqual({ ok: true, value: "1250.5" });
    expect(optionalNumber(42)).toEqual({ ok: true, value: "42" });
    expect(optionalNumber("-0")).toEqual({ ok: true, value: "0" });
    expect(optionalNumber("1.23456").ok).toBe(false);
    expect(optionalNumber("abc").ok).toBe(false);
    expect(normalizeFieldValue("number", "007")).toEqual({
      ok: true,
      value: { column: "number", value: "7" },
    });
  });

  test("blank and null clear", () => {
    expect(normalizeFieldValue("text", "  ")).toEqual({ ok: true, value: null });
    expect(normalizeFieldValue("checkbox", null)).toEqual({ ok: true, value: null });
    expect(normalizeFieldValue("select", "")).toEqual({ ok: true, value: null });
  });

  test("reuses the record rules for links, emails, phones and dates", () => {
    expect(normalizeFieldValue("url", "acme.com")).toEqual({
      ok: true,
      value: { column: "text", value: "https://acme.com" },
    });
    expect(normalizeFieldValue("email", "Ops@Acme.com")).toEqual({
      ok: true,
      value: { column: "text", value: "ops@acme.com" },
    });
    expect(normalizeFieldValue("phone", "nope").ok).toBe(false);
    expect(normalizeFieldValue("date", "2026-02-30").ok).toBe(false);
    expect(normalizeFieldValue("date", "2026-02-28")).toEqual({
      ok: true,
      value: { column: "date", value: "2026-02-28" },
    });
  });

  test("checkboxes keep false, unlike a clear", () => {
    expect(normalizeFieldValue("checkbox", false)).toEqual({
      ok: true,
      value: { column: "bool", value: false },
    });
    expect(normalizeFieldValue("checkbox", "yes")).toEqual({
      ok: true,
      value: { column: "bool", value: true },
    });
    expect(normalizeFieldValue("checkbox", "maybe").ok).toBe(false);
  });

  test("select values are option ids", () => {
    const option = createId("fop");

    expect(normalizeFieldValue("select", option)).toEqual({
      ok: true,
      value: { column: "option_id", value: option },
    });
    expect(normalizeFieldValue("select", "AWS").ok).toBe(false);
  });

  test("a stored value reads back by type", () => {
    const columns = valueColumns({ column: "bool", value: false });

    expect(readFieldValue("checkbox", columns)).toBe(false);
    expect(readFieldValue("text", columns)).toBeNull();
  });
});

describe("templates", () => {
  test("every suggested select has options and keys are distinct per entity", () => {
    for (const fields of Object.values(SUGGESTED_FIELDS)) {
      const keys = fields.map((field) => fieldKey(field.label));

      expect(new Set(keys).size).toBe(keys.length);

      for (const field of fields) {
        if (field.type === "select") expect(normalizeOptionLabels(field.options).ok).toBe(true);
      }
    }
  });

  test("standard fields list the built-in labels", () => {
    expect(STANDARD_FIELDS.company).toContain("Domain");
    expect(STANDARD_FIELDS.deal).toContain("Stage");
  });
});
