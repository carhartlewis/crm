/**
 * `turbo dev` applies pending migrations before the API starts. That is only safe against a
 * local database, so anything else needs an explicit ALLOW_REMOTE_MIGRATE=1.
 */
import { config } from "dotenv";

config({ quiet: true });

const url = process.env["DATABASE_URL"];

if (!url || !URL.canParse(url)) {
  console.error("db:migrate: DATABASE_URL is missing or invalid (see packages/core/.env.example)");
  process.exit(1);
}

const host = new URL(url).hostname;
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);

if (!local && process.env["ALLOW_REMOTE_MIGRATE"] !== "1") {
  console.error(
    `db:migrate: refusing to migrate non-local database host "${host}". Set ALLOW_REMOTE_MIGRATE=1 to override.`,
  );
  process.exit(1);
}

const migrate = Bun.spawn(["prisma", "db", "migrate"], {
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(await migrate.exited);
