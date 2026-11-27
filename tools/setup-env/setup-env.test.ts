import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDevCert, setupEnv, type EnvFile } from "./setup-env";

const FILES: EnvFile[] = [
  { dir: "app", generate: ["SECRET"], required: { CLIENT_ID: "get it from the console" } },
];

function repo(example: string, env?: string) {
  const root = mkdtempSync(join(tmpdir(), "crm-env-"));

  mkdirSync(join(root, "app"));
  writeFileSync(join(root, "app/.env.example"), example);

  if (env !== undefined) writeFileSync(join(root, "app/.env"), env);

  return {
    root,
    read: () => readFileSync(join(root, "app/.env"), "utf8"),
    done: () => rmSync(root, { recursive: true }),
  };
}

describe("setup:env", () => {
  test("a fresh clone gets .env from the example with a generated secret, and is told what's missing", () => {
    const { root, read, done } = repo('URL="postgres://localhost"\nSECRET=""\nCLIENT_ID=""\n');
    const result = setupEnv(root, FILES, () => "random");

    expect(result.created).toEqual(["app/.env"]);
    expect(result.generated).toEqual(["app/.env SECRET"]);
    expect(result.missing).toHaveLength(1);
    expect(read()).toBe('URL="postgres://localhost"\nSECRET="random"\nCLIENT_ID=""\n');
    done();
  });

  test("existing values are never overwritten and a complete file passes", () => {
    const env = 'URL="postgres://elsewhere"\nSECRET="mine"\nCLIENT_ID="abc"\n';
    const { root, read, done } = repo('URL=""\nSECRET=""\nCLIENT_ID=""\n', env);
    const result = setupEnv(root, FILES, () => "random");

    expect(result).toEqual({ created: [], generated: [], upgraded: [], missing: [] });
    expect(read()).toBe(env);
    done();
  });

  test("an old default moves to the new one; a value someone chose stays", () => {
    const files: EnvFile[] = [
      {
        dir: "app",
        upgrade: { ORIGIN: { from: "http://localhost:3000", to: "https://localhost:3000" } },
      },
    ];

    const old = repo('ORIGIN=""\n', 'ORIGIN="http://localhost:3000"\n');
    const chosen = repo('ORIGIN=""\n', 'ORIGIN="http://localhost:4000"\n');

    expect(setupEnv(old.root, files).upgraded).toEqual(["app/.env ORIGIN"]);
    expect(old.read()).toBe('ORIGIN="https://localhost:3000"\n');
    expect(setupEnv(chosen.root, files).upgraded).toEqual([]);
    expect(chosen.read()).toBe('ORIGIN="http://localhost:4000"\n');
    old.done();
    chosen.done();
  });
});

describe("dev certificate", () => {
  test("mkcert runs only while the certificate is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "crm-cert-"));
    const commands: string[][] = [];

    const run = (command: string[]) => {
      commands.push(command);
      writeFileSync(join(root, ".certs/localhost.pem"), "cert");
      writeFileSync(join(root, ".certs/localhost-key.pem"), "key");

      return true;
    };

    expect(ensureDevCert(root, run)).toBeNull();
    expect(ensureDevCert(root, run)).toBeNull();
    expect(commands.map((command) => command[0])).toEqual(["mkcert"]);
    rmSync(root, { recursive: true });
  });

  test("without mkcert a person is told how to install it", () => {
    const root = mkdtempSync(join(tmpdir(), "crm-cert-"));

    expect(ensureDevCert(root, () => false)).toContain("brew install mkcert");
    rmSync(root, { recursive: true });
  });
});
