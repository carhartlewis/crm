import type { UsageStore } from "./Usage.ts";

/** A usage store for tests: one owner (`user_1` in `ws_a`) and no paid calls yet. */
export const emptyUsage: UsageStore = {
  role: async (workspaceId, userId) =>
    workspaceId === "ws_a" && userId === "user_1" ? "owner" : null,
  markupBps: async () => 0,
  grouped: async () => [],
  rows: async () => [],
  record: async () => ({ calls: 0, price: 0 }),
};
