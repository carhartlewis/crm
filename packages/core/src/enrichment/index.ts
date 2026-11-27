/**
 * People and company enrichment through treg (ADR 0027), server-only. treg is one token in front
 * of many data providers: each contract below is one job with one input and output shape, and
 * treg tries providers in turn (cheapest per hit first) and charges only for hits. This module is
 * the single wrapper every call goes through: it tags the call with its workspace, decodes the
 * answer with the contract's schema, and reports what it cost. It decides nothing about the
 * person or company.
 */
import { Option, Schema } from "effect";
import { contactPhotoSource } from "../storage/images.ts";

export const DEFAULT_TREG_URL = "https://treg.to";

/** A provider field: text most of the time, a number or flag now and then. */
const Loose = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
);

const Flag = Schema.optional(Schema.NullOr(Schema.Boolean));

/** One person as people search rows give them. */
const PersonRowSource = Schema.Struct({
  name: Loose,
  title: Loose,
  company: Loose,
  company_domain: Loose,
  location: Loose,
  profile_url: Loose,
  email: Loose,
  email_status: Loose,
  title_match: Loose,
  summary: Loose,
});

/** A company as `companies.enrich` and provider-native search rows give it. */
const CompanySource = Schema.Struct({
  name: Loose,
  domain: Loose,
  website_domain: Loose,
  primary_domain: Loose,
  website: Loose,
  website_url: Loose,
  description: Loose,
  short_description: Loose,
  industry: Loose,
  employees: Loose,
  employee_count: Loose,
  size: Loose,
  founded: Loose,
  founded_year: Loose,
  location: Loose,
  headquarters: Loose,
  linkedin_url: Loose,
});

/** A person as `people.enrich` and `linkedin.user.profile` give them. */
const PersonSource = Schema.Struct({
  full_name: Loose,
  first_name: Loose,
  last_name: Loose,
  title: Loose,
  company: Loose,
  company_domain: Loose,
  location: Loose,
  linkedin_url: Loose,
  headline: Loose,
  about: Loose,
});

const CompanyRows = Schema.Struct({
  companies: Schema.optional(Schema.NullOr(Schema.Array(CompanySource))),
  next_cursor: Loose,
});

/** Each routed contract the CRM uses, with the output treg's contract gives it. */
export const CONTRACT_OUTPUTS = {
  "people.search": Schema.Struct({
    people: Schema.optional(Schema.NullOr(Schema.Array(PersonRowSource))),
    next_cursor: Loose,
  }),
  "people.email.find": Schema.Struct({ email: Loose, verified: Flag }),
  "people.email.verify": Schema.Struct({ status: Loose, valid: Flag }),
  "people.phone.find": Schema.Struct({ phone: Loose, line_type: Loose, country_code: Loose }),
  "people.enrich": PersonSource,
  "linkedin.user.profile": PersonSource,
  "companies.enrich": CompanySource,
  "companies.search": CompanyRows,
  "companies.similar": CompanyRows,
} as const;

export type EnrichmentContract = keyof typeof CONTRACT_OUTPUTS;

export const ENRICHMENT_CONTRACTS = Object.keys(CONTRACT_OUTPUTS);

export type ContractOutput<C extends EnrichmentContract> = (typeof CONTRACT_OUTPUTS)[C]["Type"];

/** Why a call failed. A miss (nothing found) is not a failure: it comes back as `miss`. */
export type TregFailure =
  /** The prepaid balance is empty (402). */
  | "balance"
  /** treg or every provider refused for now (429). */
  | "rate_limited"
  /** The identity was not one the contract takes (422). */
  | "invalid"
  /** The token was refused (401, 403). */
  | "unauthorized"
  /** Anything else: a timeout, a 5xx, a body that isn't treg's. */
  | "upstream";

export class TregError extends Schema.TaggedError<TregError>()("TregError", {
  reason: Schema.Literals(["balance", "rate_limited", "invalid", "unauthorized", "upstream"]),
  message: Schema.String,
}) {}

/** A mailbox or line check treg ran in the same call (`X-Treg-Route-Verify`). */
export interface TregCheck {
  readonly verdict: string;
  readonly checked: boolean;
}

/** One answered call. `output` is null on a miss. */
export interface TregAnswer<C extends EnrichmentContract = EnrichmentContract> {
  readonly contract: C;
  readonly outcome: "hit" | "miss";
  readonly output: ContractOutput<C> | null;
  /** A photo of the person in the provider's own body, on a host the CRM copies from. */
  readonly photoUrl: string | null;
  /** What treg charged, in micro-USD; misses cost nothing. */
  readonly costMicro: number;
  readonly callId: string | null;
  readonly servedBy: string | null;
  readonly check: TregCheck | null;
  /** For email finds with a domain: whether the address is at that domain. */
  readonly domainMatch: boolean | null;
  /** treg's body as it came, so a cache can answer the same question again. */
  readonly body: string;
}

/** The identity and filter fields the contracts take. */
export type TregField =
  | "q"
  | "company_domain"
  | "title"
  | "full_name"
  | "first_name"
  | "last_name"
  | "country"
  | "location"
  | "keywords"
  | "limit"
  | "cursor"
  | "email"
  | "domain"
  | "linkedin_url"
  | "name"
  | "industry"
  | "technology"
  | "website";

/** A call's body; fields left undefined are not sent. */
export type TregBody = Readonly<Partial<Record<TregField, string | number | readonly string[]>>>;

/** Attribution pairs, set by the server, never by the model. */
export type TregMeta = Readonly<
  Partial<Record<"workspace" | "user" | "origin" | "record", string>>
>;

export interface TregRequest<C extends EnrichmentContract = EnrichmentContract> {
  readonly contract: C;
  readonly body: TregBody;
  readonly meta: TregMeta;
  /** Ask treg to check the hit (email deliverability, phone line) in the same call. */
  readonly verify?: boolean;
  /** Providers to try first, such as `brightdata`. */
  readonly prefer?: readonly string[];
  /** Makes a retry after a dropped connection count once. */
  readonly idempotencyKey?: string;
}

export interface TregOptions {
  readonly token: string;
  readonly url?: string;
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  readonly timeoutMs?: number;
}

export interface Treg {
  readonly call: <C extends EnrichmentContract>(request: TregRequest<C>) => Promise<TregAnswer<C>>;
}

const Check = Schema.Struct({
  verdict: Schema.optional(Schema.NullOr(Schema.String)),
  checked: Flag,
});

const Envelope = Schema.fromJsonString(
  Schema.Struct({
    output: Schema.optional(Schema.Unknown),
    _treg: Schema.optional(
      Schema.Struct({
        outcome: Schema.optional(Schema.NullOr(Schema.String)),
        served_by: Schema.optional(Schema.NullOr(Schema.String)),
        charged_micro: Schema.optional(Schema.NullOr(Schema.Number)),
        verification: Schema.optional(Schema.NullOr(Check)),
        domain_match: Flag,
      }),
    ),
  }),
);

const decodeEnvelope = Schema.decodeUnknownOption(Envelope);

type DecodedEnvelope = (typeof Envelope)["Type"];

/** Whether an output found something (treg's own `miss` rules), by the fields it has. */
function found(output: ContractOutput<EnrichmentContract>) {
  if ("people" in output) return (output.people?.length ?? 0) > 0;

  if ("companies" in output) return (output.companies?.length ?? 0) > 0;

  if ("email" in output) return Boolean(cleanText(output.email));

  if ("status" in output) return Boolean(cleanText(output.status));

  if ("phone" in output) return Boolean(cleanText(output.phone));

  if ("full_name" in output) return Boolean(cleanText(output.full_name));

  return "name" in output && Boolean(cleanText(output.name));
}

/** The output decoded with its contract's schema, or null when it has another shape. */
function decodeOutput<C extends EnrichmentContract>(
  contract: C,
  envelope: DecodedEnvelope,
): ContractOutput<C> | null {
  const decoded = Option.getOrNull(
    Schema.decodeUnknownOption(CONTRACT_OUTPUTS[contract])(envelope.output),
  );

  if (decoded === null) return null;

  // SAFETY: `CONTRACT_OUTPUTS[contract]` decoded it, so it has contract C's output shape.
  const output = decoded as ContractOutput<C>;

  return found(output) ? output : null;
}

/** The keys providers put a person's photo under in their own body. */
const PHOTO_IN_BODY =
  /"(?:avatar|avatar_url|profile_pic|profile_pic_url|profile_picture|profile_picture_url|profile_photo|photo_url|picture|image_url)"\s*:\s*"(https:[^"]+)"/g;

/**
 * A person's photo from a provider's own body: the first value under a known key that is on a
 * host contact photos may be copied from. LinkedIn's blank default avatar is on another host, so
 * it never counts.
 */
export function photoFromBody(body: string): string | null {
  for (const match of body.matchAll(PHOTO_IN_BODY)) {
    const source = match[1] ? contactPhotoSource(match[1].replaceAll("\\/", "/")) : null;

    if (source) return source;
  }

  return null;
}

/**
 * Reads treg's body for one contract. `headers` are the live response's; a cached body has none,
 * and then costs nothing.
 */
export function readTregAnswer<C extends EnrichmentContract>(
  contract: C,
  body: string,
  headers: Headers | null,
): TregAnswer<C> | null {
  const envelope = Option.getOrNull(decodeEnvelope(body));

  if (envelope === null) return null;

  const info = envelope["_treg"];
  const said = headers?.get("x-treg-route-outcome") ?? info?.outcome ?? null;
  const output = said === "miss" ? null : decodeOutput(contract, envelope);

  const headerCost = Number(headers?.get("x-treg-cost-micro") ?? Number.NaN);

  const cost = headers
    ? Number.isFinite(headerCost)
      ? headerCost
      : (info?.charged_micro ?? 0)
    : 0;

  const verification = info?.verification;

  return {
    contract,
    outcome: output ? "hit" : "miss",
    output,
    photoUrl: output ? photoFromBody(body) : null,
    costMicro: Math.max(0, Math.round(cost)),
    callId: headers?.get("x-treg-call-id") ?? null,
    servedBy: headers?.get("x-treg-served-by") ?? info?.served_by ?? null,
    check: verification?.verdict
      ? { verdict: verification.verdict.toLowerCase(), checked: verification.checked ?? true }
      : null,
    domainMatch: info?.domain_match ?? null,
    body,
  };
}

/** A header value's `key=value` pairs, at most five; commas, equals signs and spaces dropped. */
export function metaHeader(meta: TregMeta) {
  return Object.entries(meta)
    .flatMap(([key, value]) =>
      value ? [`${key}=${value.replaceAll(/[,=\s]/g, "").slice(0, 128)}`] : [],
    )
    .slice(0, 5)
    .join(",");
}

function failureFor(status: number): TregFailure {
  if (status === 402) return "balance";

  if (status === 429) return "rate_limited";

  if (status === 422 || status === 400) return "invalid";

  return status === 401 || status === 403 ? "unauthorized" : "upstream";
}

/** What the agent is told about a failure: never treg's own body (it names our account). */
export const FAILURE_MESSAGES: Record<TregFailure, string> = {
  balance: "Enrichment is unavailable right now.",
  rate_limited: "Enrichment is busy right now. Try again in a minute.",
  invalid:
    "That isn't enough to look this up. Give a work email, a LinkedIn URL, or a full name with the company's domain.",
  unauthorized: "Enrichment is unavailable right now.",
  upstream: "The lookup failed. Try again later.",
};

export function createTreg({
  token,
  url = DEFAULT_TREG_URL,
  fetch: fetchImpl = fetch,
  timeoutMs = 60_000,
}: TregOptions): Treg {
  const base = url.replace(/\/+$/, "");

  return {
    async call(request) {
      const headers = new Headers({
        "x-treg-token": token,
        "content-type": "application/json",
        accept: "application/json",
      });

      const meta = metaHeader(request.meta);

      if (meta) headers.set("x-treg-meta", meta);

      if (request.verify) headers.set("x-treg-route-verify", "true");

      if (request.prefer?.length) headers.set("x-treg-route-prefer", request.prefer.join(","));

      if (request.idempotencyKey) headers.set("idempotency-key", request.idempotencyKey);

      let response: Response;

      try {
        response = await fetchImpl(`${base}/call/treg.${request.contract}`, {
          method: "POST",
          headers,
          // Undefined fields drop out of the JSON: only what was given is sent.
          body: JSON.stringify(request.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new TregError({ reason: "upstream", message: "treg could not be reached" });
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});

        throw new TregError({
          reason: failureFor(response.status),
          message: `treg answered ${response.status}`,
        });
      }

      const answer = readTregAnswer(request.contract, await response.text(), response.headers);

      if (!answer) {
        throw new TregError({ reason: "upstream", message: "treg's answer was not readable" });
      }

      return answer;
    },
  };
}

// ---- Normalised results: what the CRM tools hand the agent -------------------------------

type LooseValue = string | number | boolean | null | undefined;

/** Text from a provider field, or null for blanks and placeholders such as `N/A`. */
export function cleanText(value: LooseValue, max = 300): string | null {
  if (value === null || value === undefined || value === false || value === true) return null;

  const text = String(value).trim().replaceAll(/\s+/g, " ");

  if (!text || /^(n\/?a|null|none|unknown|-+)$/i.test(text)) return null;

  return text.slice(0, max);
}

/** An absolute https URL from a provider field, or null. */
export function cleanUrl(value: LooseValue): string | null {
  const text = cleanText(value, 500);

  if (!text) return null;

  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  if (!URL.canParse(withScheme)) return null;

  const url = new URL(withScheme);

  if (!url.hostname.includes(".")) return null;

  url.protocol = "https:";

  return url.href;
}

/** A LinkedIn profile URL in one form (`https://www.linkedin.com/in/<handle>`), or null. */
export function linkedinProfileUrl(value: LooseValue): string | null {
  const url = cleanUrl(value);

  if (!url) return null;

  const match = /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i.exec(url);

  return match?.[1] ? `https://www.linkedin.com/in/${decodeURIComponent(match[1])}` : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: LooseValue): string | null {
  const text = cleanText(value, 254)?.toLowerCase() ?? null;

  return text && EMAIL.test(text) ? text : null;
}

/** A domain without scheme, `www.` or path, lower-case; null when there is none. */
export function cleanDomain(value: LooseValue): string | null {
  const domain =
    cleanText(value, 200)
      ?.toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#].*$/, "") ?? "";

  return domain.includes(".") ? domain : null;
}

export interface PersonRow {
  readonly name: string;
  readonly title: string | null;
  readonly company: string | null;
  readonly companyDomain: string | null;
  readonly location: string | null;
  readonly linkedinUrl: string | null;
  readonly email: string | null;
  /** The provider's own word on `email`; null means nobody checked it. */
  readonly emailStatus: string | null;
  /** `current` or `past` when treg could tell whether the asked title is held now. */
  readonly titleMatch: string | null;
  readonly summary: string | null;
}

/** People search rows in one shape; rows without a name are dropped. */
export function peopleRows(output: ContractOutput<"people.search"> | null): PersonRow[] {
  return (output?.people ?? []).flatMap((row) => {
    const name = cleanText(row.name, 120);

    if (!name) return [];

    return [
      {
        name,
        title: cleanText(row.title, 160),
        company: cleanText(row.company, 160),
        companyDomain: cleanDomain(row.company_domain),
        location: cleanText(row.location, 160),
        linkedinUrl: linkedinProfileUrl(row.profile_url),
        email: cleanEmail(row.email),
        emailStatus: cleanText(row.email_status, 40)?.toLowerCase() ?? null,
        titleMatch: cleanText(row.title_match, 20),
        summary: cleanText(row.summary, 600),
      },
    ];
  });
}

export interface CompanyProfile {
  readonly name: string;
  readonly domain: string | null;
  readonly website: string | null;
  readonly description: string | null;
  readonly industry: string | null;
  /** Headcount or a range, as the provider states it. */
  readonly employees: string | null;
  readonly founded: string | null;
  readonly location: string | null;
  readonly linkedinUrl: string | null;
}

type CompanyFields = (typeof CompanySource)["Type"];

/** A company from `companies.enrich`, or from one provider-native search row. */
export function companyProfile(value: CompanyFields | null): CompanyProfile | null {
  const name = cleanText(value?.name, 200);

  if (!value || !name) return null;

  const domain = cleanDomain(value.domain ?? value.website_domain ?? value.primary_domain);

  return {
    name,
    domain,
    website: cleanUrl(value.website ?? value.website_url) ?? (domain ? `https://${domain}/` : null),
    description: cleanText(value.description ?? value.short_description, 1000),
    industry: cleanText(value.industry, 160),
    employees: cleanText(value.employees ?? value.employee_count ?? value.size, 40),
    founded: cleanText(value.founded ?? value.founded_year, 12),
    location: cleanText(value.location ?? value.headquarters, 200),
    linkedinUrl: cleanUrl(value.linkedin_url),
  };
}

/** Provider-native company rows (`companies.search`, `companies.similar`) in one shape. */
export function companyRows(output: ContractOutput<"companies.search"> | null): CompanyProfile[] {
  return (output?.companies ?? []).flatMap((row) => {
    const company = companyProfile(row);

    return company ? [company] : [];
  });
}

export interface PersonProfile {
  readonly name: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly company: string | null;
  readonly companyDomain: string | null;
  readonly location: string | null;
  readonly linkedinUrl: string | null;
  readonly headline: string | null;
  readonly about: string | null;
  /** A photo on a host the CRM copies from, when the provider gave one. */
  readonly photoUrl: string | null;
}

/** A person from `people.enrich` or `linkedin.user.profile`. */
export function personProfile(
  answer: Pick<TregAnswer<"people.enrich" | "linkedin.user.profile">, "output" | "photoUrl">,
): PersonProfile | null {
  const value = answer.output;
  const name = cleanText(value?.full_name, 160);

  if (!value || !name) return null;

  return {
    name,
    firstName: cleanText(value.first_name, 80),
    lastName: cleanText(value.last_name, 80),
    title: cleanText(value.title, 160),
    company: cleanText(value.company, 160),
    companyDomain: cleanDomain(value.company_domain),
    location: cleanText(value.location, 160),
    linkedinUrl: linkedinProfileUrl(value.linkedin_url),
    headline: cleanText(value.headline, 300),
    about: cleanText(value.about, 1500),
    photoUrl: answer.photoUrl,
  };
}

/** A mailbox verdict in the CRM's words (`EMAIL_STATUSES` in `@crm/core/records`). */
export function emailVerdict(word: LooseValue) {
  const verdict = cleanText(word, 40)?.toLowerCase().replaceAll(/[\s-]/g, "_") ?? "";

  if (verdict === "valid" || verdict === "deliverable" || verdict === "verified") return "valid";

  if (verdict === "catch_all" || verdict === "accept_all" || verdict === "catchall") {
    return "catch_all";
  }

  if (verdict === "invalid" || verdict === "undeliverable") return "invalid";

  return verdict === "risky" ? "risky" : "unknown";
}

/** A line check in the CRM's words (`PHONE_STATUSES`): `live`, `dead`, or `unchecked`. */
export function phoneVerdict(check: TregCheck | null) {
  if (!check?.checked) return "unchecked";

  const verdict = check.verdict;

  if (verdict === "live" || verdict === "valid" || verdict === "active") return "live";

  return verdict === "dead" || verdict === "invalid" || verdict === "inactive"
    ? "dead"
    : "unchecked";
}

/** The line type a provider reports, in the CRM's words (`PHONE_TYPES`). */
export function phoneType(value: LooseValue) {
  const text = cleanText(value, 40)?.toLowerCase() ?? "";

  if (text.includes("mobile") || text.includes("cell")) return "mobile";

  if (text.includes("work") || text.includes("direct") || text.includes("landline")) return "work";

  return text ? "other" : null;
}
