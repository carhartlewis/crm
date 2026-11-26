# CRM

A desktop-first CRM: Electron + React on Bun, an Effect API with better-auth, Prisma 8 on Postgres, and Redis.

## First run

Needs the Bun **canary** channel (1.4.5 or newer; older Bun can't read `bun.lock`), Node **24** (for Oxlint's JavaScript plugins), and Docker.

```sh
bun upgrade --canary
bun install --frozen-lockfile
turbo dev --filter=@crm/desktop   # env setup, Postgres + Redis, migrations, API, web, Electron
```

`turbo dev` creates any missing `.env` from its `.env.example` and generates the auth secret. The first time, it stops and asks for two values only you can provide: a Google OAuth client ID and secret in `apps/api/.env` (Web application client, redirect URI `http://localhost:3001/api/auth/callback/google`). Add them and run it again.

## Development

```sh
turbo dev --filter=@crm/desktop   # the whole desktop stack
bun run check                     # what CI runs
bun run infra:down                # stop Postgres and Redis
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
