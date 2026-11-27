import { describe, expect, test } from "bun:test";
import { rankSearch } from "@crm/ui/lib/search-rank";
import { catalogOf, connectionHits } from "./connections.ts";

const hits = connectionHits(catalogOf([]), [{ integration: "granola" }]);

const byId = (id: string) => hits.find((hit) => hit.id === id);

describe("⌘K connections", () => {
  test("lists every app, connected or not", () => {
    expect(byId("granola")?.connected).toBe(true);
    expect(byId("stripe")?.connected).toBe(false);
  });

  test("an app not connected opens Discover, filtered to it", () => {
    expect(byId("stripe")?.href).toBe("/settings/connections?view=discover&q=Stripe");
  });

  test("a connected app opens Yours, filtered to it", () => {
    expect(byId("granola")?.href).toBe("/settings/connections?view=yours&q=Granola");
  });

  test("searching an app's name finds it first", () => {
    const searchable = hits.map((hit) =>
      Object.assign({ label: hit.name, section: "Connections" }, hit),
    );

    expect(rankSearch(searchable, "stripe")[0]?.item.id).toBe("stripe");
  });
});
