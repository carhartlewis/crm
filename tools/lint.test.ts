import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

/** Diagnostic lines only (`path:line:col: error|warning …`); Oxlint may also print a summary. */
const diagnostics = (output: string) =>
  output.split("\n").filter((line) => /:\d+:\d+: (?:error|warning) /.test(line));

async function lint(source: string, filename = "fixture.tsx") {
  const directory = await mkdtemp(join(tmpdir(), "crm-lint-"));

  try {
    const path = join(directory, filename);

    await writeFile(path, source);

    const child = Bun.spawn(
      [
        "node",
        join(root, "node_modules/oxlint/bin/oxlint"),
        "--config",
        join(root, ".oxlintrc.json"),
        "--deny-warnings",
        path,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { exitCode, output: stdout + stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("lint policy through the real Oxlint CLI", () => {
  test("accepts ordinary typed code", async () => {
    const result = await lint(
      "export function double(value: number): number { return value * 2; }\n",
    );

    expect(diagnostics(result.output)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test("rejects chained assertions through anti-slop", async () => {
    const result = await lint("export const value = 1 as unknown as string;\n");

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("no-chained-type-assertions");
  });

  test("rejects arbitrary Tailwind values through shadcn", async () => {
    const result = await lint('export const view = <div className="p-[13px]" />;\n');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("no-arbitrary-values");
  });

  test("rejects raw palette colors through shadcn", async () => {
    const result = await lint('export const view = <div className="bg-pink-500" />;\n');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("no-raw-colors");
  });

  test("rejects focused Bun tests", async () => {
    const result = await lint(
      'import { test, expect } from "bun:test";\n\ntest.only("focused", () => { expect(1).toBe(1); });\n',
      "fixture.test.ts",
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("no-restricted-properties");
  });

  test("rejects restyling shared components", async () => {
    const result = await lint(
      'import { Button } from "@crm/ui/button";\n\nexport const view = <Button className="p-4" />;\n',
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("no-restyle");
  });

  test("allows layout and semantic colors", async () => {
    const result = await lint(
      'import { Button } from "@crm/ui/button";\n\nexport const view = <div className="bg-background text-foreground"><Button className="w-full" /></div>;\n',
    );

    expect(diagnostics(result.output)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test("rejects direct React effects, named or through the namespace", async () => {
    const named = await lint(
      'import { useEffect } from "react";\n\nexport const tick = () => useEffect(() => undefined, []);\n',
    );

    const namespaced = await lint(
      'import * as React from "react";\n\nexport const tick = () => React.useLayoutEffect(() => undefined, []);\n',
    );

    expect(named.output).toContain("crm(no-direct-effect)");
    expect(namespaced.output).toContain("crm(no-direct-effect)");
  });

  test("allows namespace React imports that don't use effects", async () => {
    const result = await lint(
      'import * as React from "react";\n\nexport const useCount = () => React.useState(0);\n',
    );

    expect(result.output).not.toContain("no-direct-effect");
  });
});
