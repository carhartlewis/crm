import { Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";
import { AppConfig } from "../config.ts";

/** The process-wide pg pool, shared by Prisma 8 and better-auth. Ended when the layer is released. */
export class Postgres extends Context.Service<Postgres, Pool>()("@crm/api/services/Postgres") {
  static readonly layer = Layer.effect(
    Postgres,
    Effect.gen(function* () {
      const { databaseUrl } = yield* AppConfig;

      return yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: Redacted.value(databaseUrl) })),
        (pool) => Effect.promise(() => pool.end()),
      );
    }),
  );
}
