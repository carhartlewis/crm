import { describe, expect, test } from "bun:test";
import {
  isWorkspaceLogo,
  isWorkspaceSlug,
  normalizeWebsite,
  normalizeWorkspaceName,
  workspaceSlug,
} from "@crm/core/workspace";

describe("normalizeWebsite", () => {
  test("adds https and canonicalises", () => {
    expect(normalizeWebsite(" acme.com ")).toEqual({ ok: true, url: "https://acme.com" });
    expect(normalizeWebsite("http://www.acme.com/about?utm=x#top")).toEqual({
      ok: true,
      url: "https://www.acme.com/about",
    });
    expect(normalizeWebsite("HTTPS://Acme.COM/")).toEqual({ ok: true, url: "https://acme.com" });
  });

  test("rejects non-web and malformed input", () => {
    for (const input of [
      "",
      "   ",
      "acme",
      "javascript:alert(1)",
      "ftp://acme.com",
      "https://user:pass@acme.com",
      "not a url at all",
    ]) {
      expect(normalizeWebsite(input).ok).toBe(false);
    }
  });
});

describe("normalizeWorkspaceName", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeWorkspaceName("  Acme   Inc ")).toEqual({ ok: true, name: "Acme Inc" });
  });

  test("rejects empty and overlong names", () => {
    expect(normalizeWorkspaceName(" ").ok).toBe(false);
    expect(normalizeWorkspaceName("x".repeat(65)).ok).toBe(false);
  });
});

describe("workspaceSlug", () => {
  test("is URL-safe and disambiguates", () => {
    expect(workspaceSlug("Acme Café & Co.")).toBe("acme-cafe-co");
    expect(workspaceSlug("Acme", "x7k2")).toBe("acme-x7k2");
    expect(workspaceSlug("!!!")).toBe("workspace");
  });
});

describe("slug and logo rules", () => {
  test("generated slugs always satisfy the slug rule", () => {
    for (const name of ["Acme Café & Co.", "!!!", "A".repeat(80)]) {
      expect(isWorkspaceSlug(workspaceSlug(name, "x7k2"))).toBe(true);
    }
  });

  test("rejects malformed slugs and non-https logos", () => {
    for (const slug of ["Acme", "acme--co", "-acme", "acme_co", "a".repeat(65)])
      expect(isWorkspaceSlug(slug)).toBe(false);

    expect(isWorkspaceLogo("https://cdn.acme.com/logo.png")).toBe(true);

    for (const logo of [
      "http://acme.com/logo.png",
      "javascript:alert(1)",
      "data:image/png;base64,AA",
    ]) {
      expect(isWorkspaceLogo(logo)).toBe(false);
    }
  });
});
