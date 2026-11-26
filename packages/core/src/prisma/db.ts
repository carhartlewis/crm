import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Pool } from "pg";
import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

/**
 * Prisma 8 client over a caller-owned `pg.Pool`. The API process creates one
 * pool, shares it with better-auth, and ends it on shutdown; `db.close()` does
 * not end a pool it was given.
 */
export function createDb(pool: Pool) {
  return postgres({ contract, pg: pool });
}

export type Db = ReturnType<typeof createDb>;
