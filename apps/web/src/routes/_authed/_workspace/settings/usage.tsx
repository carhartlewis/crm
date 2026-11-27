import { createFileRoute } from "@tanstack/react-router";

/**
 * What the workspace's paid lookups cost, month by month (ADR 0027). The page is in
 * usage.lazy.tsx. The loader waits for the first snapshot of the synced ledger (a dynamic import
 * keeps TanStack DB and Electric out of cold entry) and says which month it is now, so the page
 * renders with data and a pure render.
 */
export const Route = createFileRoute("/_authed/_workspace/settings/usage")({
  loader: async ({ context: { session } }) => {
    const usage = await import("../../../../lib/usage.ts");

    await usage.preloadUsage(session.session.activeOrganizationId ?? "");

    return { currentMonth: new Date().toISOString().slice(0, 7) };
  },
});
