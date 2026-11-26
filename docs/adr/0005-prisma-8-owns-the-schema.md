# 0005: Prisma 8 owns the schema and migrations

**Status:** accepted (2026-11)

## Context

Prisma 8 (`@prisma/orm-postgres`, release candidate) replaces `PrismaClient` and `schema.prisma` with a contract (`contract.prisma`) and planned migrations. better-auth 1.7's Prisma adapter supports only Prisma 5–7.

## Decision

- Prisma 8 owns every table and migration, including better-auth's (user, session, account, verification, workspace, member, invitation), in `packages/core/src/prisma/contract.prisma`.
- better-auth reads and writes those tables through the same `pg.Pool` (its built-in Kysely adapter), not a Prisma adapter.
- `turbo dev` applies pending migrations, but only to a local database unless `ALLOW_REMOTE_MIGRATE=1`. Never reset or drop a database to fix a migration problem.

## Consequences

- When better-auth plugins change, compare with `getAuthTables` and update the contract by hand.
- Prisma 8 is pre-1.0 stable; follow the version-matched `prisma-8` skill, not Prisma 7 knowledge.
