import { describe, expect, it } from "bun:test";

import { poppedSheet, pushedSheet, sheetStackParser, sheetUrl, withTopTab } from "./sheet-params";

const TABS = {
  company: ["overview", "contacts", "deals"],
  contact: ["overview", "deals"],
} as const;

const parser = sheetStackParser(TABS);
const company = { kind: "company", id: "com_1", tab: "overview" };
const contact = { kind: "contact", id: "con_2", tab: "deals" };

describe("sheetStackParser", () => {
  it("reads the stack bottom first, a missing tab as the first", () => {
    expect(parser.parse("company:com_1,contact:con_2:deals")).toEqual([company, contact]);
  });

  it("writes the first tab as no tab", () => {
    expect(parser.serialize([company, contact])).toBe("company:com_1,contact:con_2:deals");
  });

  it("keeps the sheets before an unknown kind or tab", () => {
    expect(parser.parse("company:com_1,lead:led_1,contact:con_2")).toEqual([company]);
    expect(parser.parse("company:com_1,contact:con_2:history")).toEqual([company]);
    expect(parser.parse("lead:led_1")).toBeNull();
  });

  it("rejects an entry without an id or with extra parts", () => {
    expect(parser.parse("company:")).toBeNull();
    expect(parser.parse("company:com_1:deals:extra")).toBeNull();
  });
});

describe("pushedSheet", () => {
  it("opens a sheet over the one it came from", () => {
    expect(pushedSheet([company], contact)).toEqual([company, contact]);
  });

  it("returns to a record already in the stack instead of opening it twice", () => {
    expect(pushedSheet([company, contact], { ...company, tab: "deals" })).toEqual([
      { ...company, tab: "deals" },
    ]);
  });
});

describe("poppedSheet", () => {
  it("closes the top sheet only", () => {
    expect(poppedSheet([company, contact])).toEqual([company]);
    expect(poppedSheet([company])).toEqual([]);
  });
});

describe("withTopTab", () => {
  it("switches the top sheet's tab and keeps the others", () => {
    expect(withTopTab([company, contact], "overview")).toEqual([
      company,
      { ...contact, tab: "overview" },
    ]);
  });
});

describe("sheetUrl", () => {
  it("links to a stack over a page", () => {
    expect(sheetUrl("/companies", parser, [company])).toBe("/companies?sheet=company:com_1");
  });
});
