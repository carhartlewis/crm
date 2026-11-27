import { expect, test } from "bun:test";
import { MAX_NOTE_CHARACTERS, memoryNoteError } from "@crm/core/memory";

test("a note needs words and fits the limit", () => {
  expect(memoryNoteError("  ")).toBe("Write a note first");
  expect(memoryNoteError("We renew in March")).toBeUndefined();
  expect(memoryNoteError("x".repeat(MAX_NOTE_CHARACTERS + 1))).toBe(
    "Keep a note under 4,000 characters",
  );
});
