import { describe, expect, test } from "bun:test";
import {
  COMPANY_NAME_MAX,
  companyDomainError,
  isCompanyId,
  normalizeCompanyDomain,
  normalizeCompanyName,
} from "@crm/core/company";

describe("normalizeCompanyName", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeCompanyName("  Acme \n  Corp ")).toEqual({ ok: true, name: "Acme Corp" });
  });

  test("requires 1 to 200 characters", () => {
    expect(normalizeCompanyName("   ").ok).toBe(false);
    expect(normalizeCompanyName("a".repeat(COMPANY_NAME_MAX)).ok).toBe(true);
    expect(normalizeCompanyName("a".repeat(COMPANY_NAME_MAX + 1)).ok).toBe(false);
  });
});

describe("normalizeCompanyDomain", () => {
  test("stores the bare lowercase hostname without www", () => {
    for (const input of [
      "acme.com",
      " ACME.com ",
      "https://www.Acme.com/about?x=1",
      "http://acme.com/",
    ]) {
      expect(normalizeCompanyDomain(input)).toEqual({ ok: true, domain: "acme.com" });
    }

    expect(normalizeCompanyDomain("eu.app.acme.co.uk")).toEqual({
      ok: true,
      domain: "eu.app.acme.co.uk",
    });
  });

  test("blank or null means no domain", () => {
    expect(normalizeCompanyDomain(null)).toEqual({ ok: true, domain: null });
    expect(normalizeCompanyDomain("  ")).toEqual({ ok: true, domain: null });
    expect(companyDomainError("")).toBeUndefined();
  });

  test("rejects values that are not a web domain", () => {
    for (const input of [
      "acme",
      "javascript:alert(1)",
      "ftp://acme.com",
      "a b.com",
      "user:pw@acme.com",
    ]) {
      expect(normalizeCompanyDomain(input).ok).toBe(false);
    }
  });
});

describe("isCompanyId", () => {
  test("accepts lowercase UUIDs only", () => {
    expect(isCompanyId(crypto.randomUUID())).toBe(true);
    expect(isCompanyId(crypto.randomUUID().toUpperCase())).toBe(false);
    expect(isCompanyId("company_1")).toBe(false);
    expect(isCompanyId("")).toBe(false);
  });
});
