import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

// CLI-only config (emit, migrations). Runtime code receives its connection from the API.
export default definePrismaConfig({
  // The prisma-8 skill is linked by the repo's `skills` CLI (see skills-lock.json).
  skills: { check: false },
  orm: ormConfig({
    contract: "./src/prisma/contract.prisma",
    db: {
      connection: process.env["DATABASE_URL"] ?? "",
    },
  }),
});
