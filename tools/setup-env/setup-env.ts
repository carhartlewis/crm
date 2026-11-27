import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  /** Old defaults replaced with new ones. Only the exact old value changes. */
  upgrade?: Readonly<Record<string, { from: string; to: string }>>;
}

export const ENV_FILES: readonly EnvFile[] = [
  { dir: "packages/core" },
  {
    dir: "apps/api",
    generate: ["BETTER_AUTH_SECRET"],
    // The dev server moved to HTTPS with HTTP/2 (apps/web/src/dev-tls.ts).
    upgrade: { WEB_ORIGIN: { from: "http://localhost:3000", to: "https://localhost:3000" } },
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
  upgraded: string[];
  missing: string[];
}

export function setupEnv(
  root: string,
  files: readonly EnvFile[] = ENV_FILES,
  secret = () => randomBytes(32).toString("base64"),
) {
  const result: SetupResult = { created: [], generated: [], upgraded: [], missing: [] };

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

      const upgrade = file.upgrade?.[key];

      if (upgrade && value === upgrade.from) {
        values.set(key, upgrade.to);
        result.upgraded.push(`${file.dir}/.env ${key}`);

        return `${key}="${upgrade.to}"`;
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

/** Runs a command and reports whether it succeeded. */
export type Run = (command: string[]) => boolean;

const MKCERT_HELP =
  "  mkcert (local HTTPS for the dev server's HTTP/2)\n      brew install mkcert && mkcert -install";

/**
 * Makes `.certs/localhost.pem` with mkcert when it is missing. The dev server needs it for
 * HTTP/2: over HTTP/1.1 the browser's six connections per host are all held by sync streams.
 * Returns what a person must do, if anything.
 */
export function ensureDevCert(root: string, run: Run): string | null {
  const dir = join(root, ".certs");
  const cert = join(dir, "localhost.pem");
  const key = join(dir, "localhost-key.pem");

  if (existsSync(cert) && existsSync(key)) return null;

  mkdirSync(dir, { recursive: true });

  const made = run([
    "mkcert",
    "-cert-file",
    cert,
    "-key-file",
    key,
    "localhost",
    "127.0.0.1",
    "::1",
  ]);

  return made ? null : MKCERT_HELP;
}

const runCommand: Run = (command) => {
  try {
    return Bun.spawnSync(command, { stdout: "ignore", stderr: "inherit" }).success;
  } catch {
    // Not installed.
    return false;
  }
};

if (import.meta.main) {
  const root = join(import.meta.dir, "..", "..");
  const result = setupEnv(root);
  const cert = ensureDevCert(root, runCommand);

  if (cert) result.missing.push(cert);

  for (const path of result.created) console.log(`setup:env: created ${path} from .env.example`);

  for (const entry of result.generated) console.log(`setup:env: generated ${entry}`);

  for (const entry of result.upgraded) console.log(`setup:env: upgraded ${entry}`);

  if (result.missing.length > 0) {
    console.error(
      `\nsetup:env: these values can't be generated. Add them, then run turbo dev again:\n\n${result.missing.join("\n")}\n`,
    );
    process.exit(1);
  }
}
