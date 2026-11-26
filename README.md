# CRM

Bun + Turborepo workspace scaffold for a collaborative AI application.
The starter applications have been removed; there is no runnable product or UI package yet.

## Development

Use the Bun **canary** channel (`bun upgrade --canary`, 1.4.5 minimum) and Node **24**. Node runs Oxlint's JavaScript plugins.

```sh
bun install --frozen-lockfile
turbo dev --filter=@crm/desktop   # Postgres + Redis, migrations, API, web, Electron
bun run check
```

| Command               | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `bun run check`       | Run lint, format validation, typechecks, tests, and builds in parallel |
| `bun run lint`        | Oxlint, anti-slop, and shadcn design-system rules; warnings fail       |
| `bun run lint:fix`    | Apply safe lint fixes                                                  |
| `bun run fmt`         | Format with Biome (also available as `bun fmt`)                        |
| `bun run fmt:check`   | Validate formatting without writing                                    |
| `bun run check-types` | Native Bun typechecking for tooling and package checks via Turbo       |
| `bun test`            | Run all unit/integration tests                                         |
| `bun run test`        | Run test files in parallel with isolated workers                       |
| `bun run test:watch`  | Watch tests during development                                         |
| `bun run test:ci`     | Run tests using recorded timings and optional PR change selection      |
| `bun run build`       | Build workspace packages that define a build script                    |
| `bun run dev`         | Start workspace development tasks                                      |

`bun check` dispatches to this repo's `check` script. Use `bun check --no-script`
for the native typechecker alone. Likewise `bun fmt` dispatches to the Biome script;
do not use `bun fmt --no-script` on the same files with a second formatting policy.

Oxlint owns lint policy; Biome owns formatting, including Markdown and YAML.
There is no ESLint or Prettier configuration.

The current checks cover repository tooling. Package typechecks and builds will
have work to do once application packages are added; a green scaffold is not a
verified application build.

## Conventions

- [Engineering and performance](docs/engineering.md): tooling policy, tests, CI, and Glass-inspired practices.
- [Local issue tracker](docs/agents/issue-tracker.md): specs and tickets under `.scratch/`.
- [Domain documentation](docs/agents/domain.md): one shared glossary and ADR directory, created when needed.
- [Agent instructions](AGENTS.md): required checks and version-matched documentation.

Installed project skills live under `.agents/skills/` and are recorded in
`skills-lock.json`. Treat their files as vendor content; linting, formatting, and
test discovery exclude them.
