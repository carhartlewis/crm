import { describe, expect, it } from "bun:test";

import { recordSheetUrl, recordTabParser } from "./sheet-params";

const TABS = ["overview", "snapshots"] as const;

describe("recordSheetUrl", () => {
  it("opens a record on its first tab with no tab key", () => {
    expect(
      recordSheetUrl("/acme/sandboxes", {
        recordKey: "sandbox",
        id: "sbx_1",
        tabs: TABS,
      }),
    ).toBe("/acme/sandboxes?sandbox=sbx_1");
  });

  it("opens a record on another tab", () => {
    expect(
      recordSheetUrl("/acme/sandboxes", {
        recordKey: "sandbox",
        id: "sbx_1",
        tabs: TABS,
        tab: "snapshots",
      }),
    ).toBe("/acme/sandboxes?sandbox=sbx_1&tab=snapshots");
  });
});

describe("recordTabParser", () => {
  it("reads a known tab", () => {
    expect(recordTabParser(TABS).parse("snapshots")).toBe("snapshots");
  });

  it("refuses a tab that the sheet does not have", () => {
    expect(recordTabParser(TABS).parse("billing")).toBeNull();
  });

  it("uses the first tab when the URL has none", () => {
    expect(recordTabParser(TABS).defaultValue).toBe("overview");
  });
});
