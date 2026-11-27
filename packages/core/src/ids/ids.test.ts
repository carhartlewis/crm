import { describe, expect, test } from "bun:test";
import contract from "../prisma/contract.json";
import { createId, ID_EXEMPTIONS, ID_PREFIXES, isId, isRecordId } from "./index.ts";

describe("record ids", () => {
  test("every table has a prefix or a reason it has none", () => {
    const covered = new Set([...Object.keys(ID_PREFIXES), ...Object.keys(ID_EXEMPTIONS)]);

    expect(Object.keys(contract.roots).filter((table) => !covered.has(table))).toEqual([]);
  });

  test("prefixes are short, lowercase and never shared", () => {
    const prefixes = Object.values(ID_PREFIXES);

    expect(new Set(prefixes).size).toBe(prefixes.length);

    for (const prefix of prefixes) expect(prefix).toMatch(/^[a-z]{3,4}$/);
  });

  test("a new id is the prefix and 24 base62 characters", () => {
    const id = createId("com");

    expect(id).toMatch(/^com_[0-9A-Za-z]{24}$/);
    expect(isId("com", id)).toBe(true);
    expect(isId("ctc", id)).toBe(false);
    expect(createId("com")).not.toBe(id);
  });

  test("drops bytes that would bias the alphabet", () => {
    // 248 and up would favour the first characters; they are skipped, not wrapped.
    const bytes = [255, 248, ...Array.from({ length: 24 }, (_, index) => index)];

    const random = (target: Uint8Array) => {
      for (let index = 0; index < target.length; index += 1) target[index] = bytes.shift() ?? 0;

      return target;
    };

    expect(createId("skl", random)).toBe("skl_0123456789ABCDEFGHIJKLMN");
  });

  test("refuses other spellings, and accepts the UUIDs of older rows", () => {
    expect(isRecordId("com", crypto.randomUUID())).toBe(true);
    expect(isRecordId("com", crypto.randomUUID().toUpperCase())).toBe(false);
    expect(isRecordId("com", "com_short")).toBe(false);
    expect(isRecordId("com", `com_${"a".repeat(24)}\n`)).toBe(false);
    expect(isRecordId("com", `ctc_${"a".repeat(24)}`)).toBe(false);
    expect(isRecordId("com", "")).toBe(false);
  });
});
