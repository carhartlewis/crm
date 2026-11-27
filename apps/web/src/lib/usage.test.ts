import { describe, expect, test } from "bun:test";
import { type UsageEvent, usageMonths, usageReport } from "./usage.ts";

const event = (id: string, at: string, fields: Partial<UsageEvent> = {}): UsageEvent => ({
  id,
  workspace_id: "ws_a",
  user_id: "user_ana",
  origin: "research",
  contract: "people.email.find",
  outcome: "hit",
  price_micro: 4950,
  record_kind: "contact",
  record_id: "ctc_1",
  created_at: at,
  ...fields,
});

const ledger = [
  event("use_1", "2026-11-03T10:00:00.000Z"),
  event("use_2", "2026-11-03T11:00:00.000Z", {
    contract: "people.phone.find",
    price_micro: 47_000,
  }),
  event("use_3", "2026-11-20T09:00:00.000Z", { origin: "chat", user_id: null, price_micro: 2600 }),
  event("use_4", "2026-10-30T09:00:00.000Z"),
];

const names = (id: string | null) => (id === "user_ana" ? "Ana" : "Former member");

describe("usage report", () => {
  test("adds up one month by day, source, member and lookup", () => {
    const report = usageReport(ledger, new Map(), "2026-11", names);

    expect(report).toMatchObject({ calls: 3, priceMicro: 54_550, costMicro: null });
    expect(report.days).toHaveLength(30);
    expect(report.days[2]).toEqual({ day: "2026-11-03", priceMicro: 51_950 });
    expect(report.days[0]?.priceMicro).toBe(0);
    expect(report.origins.map((line) => line.label)).toEqual(["Research on new records", "Chats"]);
    expect(report.members.map((line) => line.label)).toEqual(["Ana", "Former member"]);
    expect(report.jobs[0]).toMatchObject({ label: "Find phone", calls: 1, priceMicro: 47_000 });
  });

  test("shows what lookups cost us only when the costs synced (owners and admins)", () => {
    const costs = new Map([
      ["use_1", 4950],
      ["use_2", 47_000],
      ["use_3", 2600],
    ]);

    expect(usageReport(ledger, costs, "2026-11", names).costMicro).toBe(54_550);
  });

  test("lists the months with lookups, newest first, always with this month", () => {
    expect(usageMonths(ledger, "2026-12")).toEqual(["2026-12", "2026-11", "2026-10"]);
  });
});
