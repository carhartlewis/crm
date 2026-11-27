import { describe, expect, test } from "bun:test";
import {
  researchActive,
  researchingPeople,
  researchStatus,
  type ResearchRecord,
} from "./research-status.ts";

const record = (status: string, archived_at: string | null = null): ResearchRecord => ({
  enrichment_status: status,
  enrichment_error: null,
  archived_at,
});

describe("record research feedback", () => {
  test("an optimistic record shows queued feedback before the agent starts", () => {
    expect(researchStatus(record("pending"))).toMatchObject({
      state: "queued",
      label: "Research queued",
    });
    expect(researchActive(record("pending"))).toBe(true);
    expect(researchStatus(record("running"))).toMatchObject({
      state: "running",
      label: "Researching",
    });
  });

  test("completion, no match and failure all stop the photo placeholder", () => {
    for (const status of ["complete", "skipped", "failed"]) {
      expect(researchActive(record(status))).toBe(false);
    }

    expect(researchStatus(record("complete"))).toBeNull();
    expect(researchStatus(record("skipped"))).toBeNull();
    expect(researchStatus(record("failed"))).toMatchObject({
      state: "failed",
      label: "Research interrupted",
    });
  });

  test("a company stays active until its contacts settle, including queued contacts", () => {
    const counts = researchingPeople([
      { ...record("pending"), company_id: "com_a" },
      { ...record("running"), company_id: "com_a" },
      { ...record("complete"), company_id: "com_a" },
      { ...record("failed"), company_id: "com_a" },
      { ...record("running", "2026-11-27"), company_id: "com_a" },
      { ...record("running"), company_id: "com_b" },
      { ...record("running"), company_id: null },
    ]);

    expect([...counts]).toEqual([
      ["com_a", 2],
      ["com_b", 1],
    ]);
    expect(researchStatus(record("complete"), counts.get("com_a"))).toMatchObject({
      state: "running",
      label: "Researching 2 people",
    });
    expect(researchStatus(record("complete"), 1)?.label).toBe("Researching 1 person");
    expect(researchStatus(record("complete"), 0)).toBeNull();
  });

  test("archived records stay quiet even if research was running", () => {
    const archived = record("running", "2026-11-27");
    expect(researchActive(archived)).toBe(false);
    expect(researchStatus(archived, 2)).toBeNull();
  });

  test("unknown states do not invent progress", () => {
    expect(researchActive(record("unknown"))).toBe(false);
    expect(researchStatus(record("unknown"))).toBeNull();
  });
});
