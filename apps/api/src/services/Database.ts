import { createDb, type Db } from "@crm/core/db";
import { Context, Effect, Layer } from "effect";
import { Postgres } from "./Postgres.ts";

/** Prisma 8 client over the shared pool. */
export class Database extends Context.Service<Database, Db>()("@crm/api/services/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      return createDb(yield* Postgres);
    }),
  ).pipe(Layer.provide(Postgres.layer));
}
