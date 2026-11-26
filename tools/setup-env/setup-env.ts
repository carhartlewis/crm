import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * First-run environment setup, run by Turbo before migrations and the API (`//#setup:env`).
 * Creates each missing `.env` from its committed `.env.example`, generates secrets that only
 * need to be random, and reports values that only a person can provide. Never overwrites a
 * value that is already set.
 */

export interface EnvFile {
  /** Directory holding `.env.example`, relative to the repo root. */
  dir: string;
  /** Keys filled with a random secret when empty. */
  generate?: readonly string[];
  /** Keys a person must provide, with instructions. */
  required?: Readonly<Record<string, string>>;
}

export const ENV_FILES: readonly EnvFile[] = [
  { dir: "packages/core" },
  {
    dir: "apps/api",
    generate: ["BETTER_AUTH_SECRET"],
    required: {
      GOOGLE_CLIENT_ID:
        "Google OAuth client (Web application) from https://console.cloud.google.com/auth/clients — redirect URI http://localhost:3001/api/auth/callback/google",
      GOOGLE_CLIENT_SECRET: "The secret for the same Google OAuth client",
    },
  },
];

const LINE = /^([A-Z][A-Z\d_]*)=(.*)$/;

function unquote(value: string) {
  const trimmed = value.trim();

  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

export interface SetupResult {
  created: string[];
  generated: string[];
  missing: string[];
}

export function setupEnv(
  root: string,
  files: readonly EnvFile[] = ENV_FILES,
  secret = () => randomBytes(32).toString("base64"),
) {
  const result: SetupResult = { created: [], generated: [], missing: [] };

  for (const file of files) {
    const envPath = join(root, file.dir, ".env");
    const examplePath = join(root, file.dir, ".env.example");

    if (!existsSync(envPath)) {
      writeFileSync(envPath, readFileSync(examplePath, "utf8"));
      result.created.push(join(file.dir, ".env"));
    }

    const lines = readFileSync(envPath, "utf8").split("\n");
    const values = new Map<string, string>();

    const updated = lines.map((line) => {
      const match = LINE.exec(line);

      if (!match?.[1]) return line;

      const key = match[1];
      const value = unquote(match[2] ?? "");

      if (!value && file.generate?.includes(key)) {
        const generated = secret();

        values.set(key, generated);
        result.generated.push(`${file.dir}/.env ${key}`);

        return `${key}="${generated}"`;
      }

      values.set(key, value);

      return line;
    });

    writeFileSync(envPath, updated.join("\n"));

    for (const [key, help] of Object.entries(file.required ?? {})) {
      if (!values.get(key)) result.missing.push(`  ${file.dir}/.env  ${key}\n      ${help}`);
    }
  }

  return result;
}

if (import.meta.main) {
  const result = setupEnv(join(import.meta.dir, "..", ".."));

  for (const path of result.created) console.log(`setup:env: created ${path} from .env.example`);

  for (const entry of result.generated) console.log(`setup:env: generated ${entry}`);

  if (result.missing.length > 0) {
    console.error(
      `\nsetup:env: these values can't be generated. Add them, then run turbo dev again:\n\n${result.missing.join("\n")}\n`,
    );
    process.exit(1);
  }
}
