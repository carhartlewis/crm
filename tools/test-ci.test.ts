import { describe, expect, test } from "bun:test";
import { canSelectAffectedTests } from "./test-ci";

describe("CI affected-test selection", () => {
  test("uses the import graph for source-only workspace changes", () => {
    expect(
      canSelectAffectedTests(["apps/web/src/chat.tsx", "packages/core/src/store.ts"], []),
    ).toBe(true);
  });

  test.each([
    "bun.lock",
    "package.json",
    "bunfig.toml",
    ".oxlintrc.json",
    "biome.json",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/vite.config.ts",
    "packages/core/src/schema.sql",
    "apps/web/src/theme.css",
    "tools/test-ci.ts",
    ".github/workflows/ci.yml",
  ])("runs all tests when %s changes outside the source import graph", (path) => {
    expect(canSelectAffectedTests(["apps/web/src/chat.tsx", path], [])).toBe(false);
  });

  test("runs all tests for deletions and empty change sets", () => {
    expect(
      canSelectAffectedTests(["packages/core/src/store.ts"], ["packages/core/src/old.ts"]),
    ).toBe(false);
    expect(canSelectAffectedTests([], [])).toBe(false);
  });
});
