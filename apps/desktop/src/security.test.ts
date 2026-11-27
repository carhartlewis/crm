import { describe, expect, test } from "bun:test";
import { contentSecurityPolicy, isAllowedExternal, isAppUrl } from "./security.ts";

describe("desktop security policy", () => {
  test("only https and mailto links leave the app", () => {
    expect(isAllowedExternal("https://accounts.google.com/o/oauth2")).toBe(true);
    expect(isAllowedExternal("mailto:alice@example.com")).toBe(true);

    for (const url of [
      "http://example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "smb://host/share",
      "not a url",
    ]) {
      expect(isAllowedExternal(url)).toBe(false);
    }
  });

  test("the window stays on the app origin", () => {
    expect(isAppUrl("http://localhost:3000/sign-in", "http://localhost:3000")).toBe(true);
    expect(isAppUrl("http://localhost:3001/api", "http://localhost:3000")).toBe(false);
    expect(isAppUrl("https://evil.example/", "http://localhost:3000")).toBe(false);
  });

  test("packaged builds forbid inline scripts and plugins", () => {
    const csp = contentSecurityPolicy(false);

    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(contentSecurityPolicy(true)).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    );
  });

  test("images load only from the app and image storage", () => {
    expect(contentSecurityPolicy(false)).toContain(
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com;",
    );
    expect(contentSecurityPolicy(true)).toContain("http://127.0.0.1:59000");
  });
});
