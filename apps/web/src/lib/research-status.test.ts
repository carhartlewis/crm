import { describe, expect, test } from "bun:test";
import {
  activityStatus,
  researchActivity,
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
      label: "Queued",
    });
    expect(researchActive(record("pending"))).toBe(true);
    expect(researchStatus(record("running"))).toMatchObject({
      state: "running",
      label: "Researching",
    });
  });

  test("completion, no match and failure all stop the avatar placeholder", () => {
    for (const status of ["complete", "skipped", "failed"]) {
      expect(researchActive(record(status))).toBe(false);
    }

    expect(researchStatus(record("complete"))).toBeNull();
    expect(researchStatus(record("skipped"))).toBeNull();
    expect(researchStatus(record("failed"))).toMatchObject({
      state: "failed",
      label: "Failed",
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
      label: "Researching",
    });
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

  test("the workspace summary counts running and queued research, never archived rows", () => {
    const activity = researchActivity([
      record("running"),
      record("running"),
      record("pending"),
      record("pending"),
      record("pending"),
      record("complete"),
      record("running", "2026-11-27"),
    ]);

    expect(activity).toEqual({ running: 2, queued: 3 });
    expect(activityStatus(activity)).toMatchObject({
      state: "running",
      label: "Researching 2 · 3 queued",
    });
    expect(activityStatus({ running: 0, queued: 4 })).toMatchObject({
      state: "queued",
      label: "4 queued",
    });
    expect(activityStatus({ running: 1, queued: 0 })?.label).toBe("Researching 1");
    expect(activityStatus({ running: 0, queued: 0 })).toBeNull();
  });
});
