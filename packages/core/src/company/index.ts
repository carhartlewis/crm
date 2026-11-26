/**
 * Company rules shared by the API (writes) and the web forms (inline errors). Client-safe.
 */
import { normalizeWebsite } from "../workspace/index.ts";

export const COMPANY_NAME_MAX = 200;

export type CompanyNameResult = { ok: true; name: string } | { ok: false; message: string };

/** Trims and collapses whitespace; 1 to 200 characters. */
export function normalizeCompanyName(input: string): CompanyNameResult {
  const name = input.trim().replaceAll(/\s+/g, " ");

  if (!name) return { ok: false, message: "Enter a company name" };

  if (name.length > COMPANY_NAME_MAX) {
    return { ok: false, message: `Keep it under ${COMPANY_NAME_MAX} characters` };
  }

  return { ok: true, name };
}

export type CompanyDomainResult =
  | { ok: true; domain: string | null }
  | { ok: false; message: string };

/**
 * Accepts `acme.com`, `https://www.Acme.com/about`, or blank. Stores the bare lowercase hostname
 * without a leading `www.`, or `null` when blank, so one company has one domain spelling.
 */
export function normalizeCompanyDomain(input: string | null): CompanyDomainResult {
  if (input === null || !input.trim()) return { ok: true, domain: null };

  const website = normalizeWebsite(input);

  if (!website.ok) return { ok: false, message: "Enter a valid domain, like acme.com" };

  const host = new URL(website.url).hostname.toLowerCase().replace(/^www\./, "");

  if (!host.includes(".") || host.length > 253) {
    return { ok: false, message: "Enter a valid domain, like acme.com" };
  }

  return { ok: true, domain: host };
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

/**
 * Company ids are client-generated lowercase UUIDs (`crypto.randomUUID()`). They are stored as
 * sent, so the optimistic row and the synced row share one key; other spellings are refused.
 */
export function isCompanyId(value: string) {
  return UUID.test(value);
}

/** Field validators for forms: the error message, or `undefined` when the value is valid. */
export function companyNameError(value: string) {
  const result = normalizeCompanyName(value);

  return result.ok ? undefined : result.message;
}

export function companyDomainError(value: string) {
  const result = normalizeCompanyDomain(value);

  return result.ok ? undefined : result.message;
}
