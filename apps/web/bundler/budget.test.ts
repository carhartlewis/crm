import { describe, expect, test } from "bun:test";
import { checkBudgets, coldEntryFiles } from "./budget.ts";

const files = new Map(
  Object.entries({
    "main.js":
      'import{a as b}from"./chunk-a.js";import"./chunk-b.js";const lazy=()=>import("./route-lazy.js");',
    "chunk-a.js": 'import{x}from"./chunk-b.js";export const a=1;',
    "chunk-b.js": "export const x=2;",
    "route-lazy.js": "export default 3;",
    "main.css": "body{color:red}",
  }),
);

const read = (file: string) => files.get(file) ?? "";

const html =
  '<link rel="stylesheet" href="./main.css"><script type="module" src="./main.js"></script>';

describe("cold-entry budget", () => {
  test("follows static imports once and excludes dynamic imports", () => {
    expect(coldEntryFiles(html, read)).toEqual({
      js: ["main.js", "chunk-a.js", "chunk-b.js"],
      css: ["main.css"],
    });
  });

  test("fails when a budget is exceeded", () => {
    const report = checkBudgets(html, read, { coldEntryJs: 1, firstViewCss: 100_000 });

    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toStartWith("cold-entry JS");
  });

  test("passes within budget", () => {
    expect(checkBudgets(html, read).failures).toEqual([]);
  });
});
