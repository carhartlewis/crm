# Engineering conventions

## Tool ownership

- Bun follows the canary channel: `bun upgrade --canary` locally and `bun-version: canary`
  in CI, which logs the exact build. `package.json` records 1.4.5 as the minimum; Bun does
  not enforce `engines`. If a canary regresses, pin CI to the last good stable release and
  note it here. Use `bun install`; commit `bun.lock`.
  CI uses `--frozen-lockfile`. Keep the isolated linker and shared global store
  already configured in `bunfig.toml`.
- Oxlint runs native correctness, suspicious, and performance rules, plus the
  published anti-slop rules and `@shadcn/lint`. React hooks and accessibility
  checks are enabled. Warnings and unused disable comments fail the command.
- Biome is the only formatter. Its linter and assist actions are disabled to
  avoid overlapping tools making competing changes. It formats JS/TS, JSON,
  CSS, Markdown, and YAML. `AGENTS.md` is excluded to preserve Turbo's managed
  block byte-for-byte. Installed skills, scratch work, generated code, caches,
  and build output are excluded.
- Use native `bun check --no-script` for typechecking; add a `check-types` script
  in each source workspace. Each workspace should own its tsconfig and actual
  dependencies. Root typechecking covers `tools/`, not arbitrary future apps.
- Turbo manages package builds and checks. The `transit` task propagates source
  dependency changes into typecheck hashes without serializing the checks.
  Packages that need generated files must add real build dependencies.

The anti-slop README contains policies newer than its published 0.1.1 package.
Only rules exported by the installed release are enabled. Do not add a rule name
from the main-branch README without checking the installed exports first.

## Design-system policy

The requested setup enables four shadcn rules: no arbitrary values, no raw colors,
statically readable class expressions, and no component restyling beyond layout.
The component implementation directory (`**/components/ui/**`) may define its own
appearance; it is exempt only from `no-restyle`. Shared patterns in `packages/ui/src/patterns/**` (the data table, page shell, record sheet) compose components and own their appearance the same way, so they are exempt from `no-restyle` too.

Shared `@crm/ui` imports are recognized. Once an app exists, configure its actual
`components.json` and Tailwind v4 theme so discovery can supply precise tokens,
variants, and suggestions. Update the override if its component directory differs.
Theme-based unknown-class validation is intentionally not enabled before a theme
exists. Inline styles remain available for measured values and animation CSS
variables; static appearance belongs in components and theme tokens.

Use narrow inline exceptions with an explanation when an actual boundary requires
one (for example external-data validation or an essential computed layout value).
Do not disable whole categories to make a change pass. Refactor the underlying
problem first, and keep exceptions local and reviewable.

## Tests and feedback speed

- Write unit/integration tests with `bun:test`; use explicit dependencies instead
  of module mocking. Test observable behavior and meaningful failure cases.
- `bun run test` parallelizes test files in isolated worker processes. Tests in a
  file stay sequential unless they are explicitly safe to run concurrently.
- Never commit `.only` in test files. Use a filename or `--test-name-pattern`.
- Separate browser/Electron E2E tests into `e2e/` or `*.e2e.*`; Bun discovery
  excludes them. Add a dedicated Playwright command when an app exists.
- Build a backend app once per test worker/process when it exists. Reset mutable
  state between tests, inject dependencies, and use isolated database fixtures.
- Run `bun run check` before handing changes back. All independent checks run in
  parallel and complete even when another check fails; the overall command fails
  if any check fails.

## CI and affected tests

`.github/workflows/ci.yml` uses one install and runs independent checks concurrently,
cancels superseded branch runs, restores Bun's package cache and Turbo's task
cache, and checks out full history. Full tests run on main/master pushes and manual
runs. PRs provide `TEST_BASE` to `tools/test-ci.ts`.

For PRs containing only JS/TS source changes under `apps/` or `packages/`, the test
runner asks Bun to follow the affected import graph with `--changed=<merge-base>`.
Configuration, dependency, tooling, asset, schema, deleted/renamed files, missing
Git history, and empty change sets fall back to the full suite. Only an affected
run may pass with no selected tests. Full runs fail if there are no tests.

Keep tests connected to production code through imports. For future runtime plugin
discovery, generated code, or filesystem-loaded data, extend the full-suite fallback
before relying on affected selection. Full default-branch runs are an additional
backstop, not a substitute for correct PR selection.

CI records durations in `.cache/test-timings.json`; Bun schedules slow files first.
There are currently only two tooling test files, so multiple CI shard jobs would
add overhead. When the suite warrants it, use Bun's native duration-balanced shards:

```sh
bun test --parallel=2 --shard=1/2 --timings=.cache/test-timings.json
bun test --parallel=2 --shard=2/2 --timings=.cache/test-timings.json
```

Give each CI shard its own output timings file, and merge/read those files on the
next run. Do not have parallel shards overwrite one shared timings file.

Remote Turbo caching is optional and not configured: this repo has no remote or
credentials. The workflow can run after the repository is published to GitHub.
There is no claim that CI is under one minute until a real hosted run is measured.

## Runtime and interaction practices for future apps

These are implementation requirements when the relevant app exists, not completed
optimizations in this scaffold:

- **Electron launch:** bundle main-process code, package runtime dependencies only,
  defer non-launch imports, and overlap required connection setup with window
  creation. Keep context isolation, sandboxing, and validated IPC boundaries.
- **Measure:** collect cold/warm launch-to-interactive, archive and renderer bundle
  sizes, typing and streaming frame times, and network waterfalls. Add representative
  benchmarks and regression budgets once a repeatable baseline exists.
- **Composer:** keep typing local, persist drafts, handle paste deliberately, prefetch
  contextual suggestions, preserve focus, and keep keyboard selection stable while
  asynchronous suggestions arrive.
- **Menus and palettes:** preload relevant data, update it with SSE/polling, and use
  page context. Avoid React state updates on every drag frame. Animate transform and
  opacity; preserve gesture velocity and respect reduced-motion preferences.
- **Streaming:** benchmark the renderer with real responses and diagrams. Measure
  dropped frames and update cost separately from provider response latency. Do not
  adopt a renderer solely from a library's headline benchmark.
- **Collaborative documents:** use compact typed agent operations, revision checks,
  conflict handling, and explicit accept/dismiss for proposed changes. Lazy-load
  heavy canvases. Test concurrent edits and reconnect/replay behavior.
- **Performance maintenance:** make metrics and traces part of review. Introduce
  automated regression investigation only when observability and a review flow exist.

## Sources

These conventions adapt the relevant November 2026 posts researched in this session:

- [Electron startup](https://x.com/pontusab/status/2120852872430797034)
- [Composer behavior](https://x.com/pontusab/status/2120516059619033571)
- [Whiteboard operations and concurrency](https://x.com/pontusab/status/2121266845521187275)
- [Mobile gestures](https://x.com/pontusab/status/2121552651422978254)
- [Command palette](https://x.com/pontusab/status/2121903391001739416)
- [In-app streaming measurements](https://x.com/pontusab/status/2123334088824078433)
- [Bun CI and test selection](https://x.com/pontusab/status/2123750671795261748)
- [Metrics-driven development](https://x.com/pontusab/status/2122257368213819702)

For implementation details, use the installed tools' documentation and CLI help.
Generic posts about other companies' runtimes or proposed stacks are not evidence
that those technologies belong in this repo.
