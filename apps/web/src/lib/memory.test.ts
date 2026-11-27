import { describe, expect, test } from "bun:test";
import type { Knowledge } from "@crm/core/api";
import { knowledgePollInterval as interval } from "./memory.ts";

const knowledge: Knowledge = {
  enabled: true,
  profile: [],
  facts: [],
  sources: [
    { id: "note", kind: "member_note", title: "A note", status: "done", updatedAt: "2026-11-27" },
  ],
};

describe("memory during record research", () => {
  test("an existing note does not stop looking for the agent's new brief", () => {
    expect(interval(knowledge, true)).toBe(4000);
    expect(interval(knowledge, false, 100, 50)).toBe(4000);
  });

  test("keeps polling while saved sources are being processed, after research ends", () => {
    expect(
      interval(
        {
          ...knowledge,
          sources: knowledge.sources.map((source) => ({ ...source, status: "processing" })),
        },
        false,
      ),
    ).toBe(4000);
  });

  test("stops when research and source processing settle, or memory is disabled", () => {
    expect(interval(knowledge, false)).toBe(false);
    expect(interval({ ...knowledge, enabled: false }, true)).toBe(false);
    expect(interval({ ...knowledge, sources: [] }, false, 100, 101)).toBe(false);
  });
});
