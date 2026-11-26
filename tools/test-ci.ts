import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Non-source changes can affect tests without appearing in the import graph.
// Deletions and renames can remove graph edges, so they also require a full run.
export function canSelectAffectedTests(paths: string[], deletedPaths: string[]): boolean {
  return (
    paths.length > 0 &&
    deletedPaths.length === 0 &&
    paths.every(
      (path) =>
        /^(apps|packages)\/.+\.[cm]?[jt]sx?$/.test(path) &&
        !/(^|\/)[^/]*config[^/]*\.[cm]?[jt]s$/.test(path) &&
        !/(^|\/)tools\//.test(path),
    )
  );
}

async function gitOutput(args: string[]): Promise<string | null> {
  const child = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "inherit" });
  const output = await new Response(child.stdout).text();
  const exitCode = await child.exited;

  return exitCode === 0 ? output : null;
}

async function run(): Promise<number> {
  process.chdir(resolve(import.meta.dir, ".."));
  await mkdir(".cache", { recursive: true });

  const args = ["test", "--parallel=2", "--timings=.cache/test-timings.json", "--update-timings"];
  const base = process.env.TEST_BASE;

  if (base) {
    const mergeBase = await gitOutput(["merge-base", base, "HEAD"]);

    if (mergeBase) {
      const commit = mergeBase.trim();
      const changed = await gitOutput(["diff", "--name-only", "-z", commit, "HEAD"]);

      const deleted = await gitOutput([
        "diff",
        "--name-only",
        "--diff-filter=D",
        "--no-renames",
        "-z",
        commit,
        "HEAD",
      ]);

      if (
        changed !== null &&
        deleted !== null &&
        canSelectAffectedTests(
          changed.split("\0").filter(Boolean),
          deleted.split("\0").filter(Boolean),
        )
      ) {
        args.push(`--changed=${commit}`, "--pass-with-no-tests");
      }
    }
  }

  console.log(`Running bun ${args.join(" ")}`);

  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  return child.exited;
}

if (import.meta.main) {
  process.exitCode = await run();
}
