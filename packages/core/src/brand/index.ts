import { z } from "zod";

/**
 * Server-only client for context.dev brand data (https://docs.context.dev). It finds a company's
 * square logo from its domain. The API key is injected; never read env vars here, and never send
 * the key to a browser.
 */

export type BrandFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ContextDevOptions {
  readonly apiKey: string;
  readonly fetch?: BrandFetch;
  /** context.dev crawls on a cold lookup (p90 ≈ 18 s); a logo is never worth a longer wait. */
  readonly timeoutMs?: number;
}

export interface BrandLogos {
  /**
   * Square logo URLs for a domain, best first: raster before SVG (the image cache keeps only
   * raster images), an opaque background before a transparent one, then the larger one. Empty
   * when context.dev knows no brand for the domain or can't be reached.
   */
  readonly iconUrls: (domain: string) => Promise<readonly string[]>;
}

const BASE = "https://api.context.dev/v1";

const API = `${BASE}/brand/retrieve-simplified`;

const Logo = z.object({
  url: z.string(),
  type: z.string().optional(),
  mode: z.string().optional(),
  resolution: z.object({ width: z.number().optional() }).nullish(),
});

const Simplified = z.object({ brand: z.object({ logos: z.array(Logo).nullish() }).nullish() });

type Logo = z.infer<typeof Logo>;

const isRaster = (url: string) => /\.(png|jpe?g|webp|gif|ico)(\?|$)/i.test(url);

function rank(logo: Logo) {
  return [
    isRaster(logo.url) ? 0 : 1,
    logo.mode === "has_opaque_background" ? 0 : 1,
    -(logo.resolution?.width ?? 0),
  ];
}

function compare(a: Logo, b: Logo) {
  const left = rank(a);
  const right = rank(b);
  const index = left.findIndex((value, at) => value !== right[at]);

  return index === -1 ? 0 : (left[index] ?? 0) - (right[index] ?? 0);
}

/** A bare, lowercase hostname, or null for anything that isn't one. */
export function brandDomain(value: string) {
  const host = (URL.canParse(value) ? new URL(value).hostname : value).toLowerCase();
  const bare = host.replace(/^www\./, "");

  // The last label must start with a letter, so IP addresses are refused.
  return /^([a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(bare) ? bare : null;
}

/** What context.dev knows about a company, plus its home page as Markdown. */
export interface BrandResearch {
  readonly domain: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly slogan: string | null;
  readonly industries: readonly string[];
  readonly address: string | null;
  readonly socials: readonly { readonly type: string; readonly url: string }[];
  /** Careers, pricing, blog, contact … page URLs, by kind. */
  readonly links: Readonly<Record<string, string>>;
  readonly email: string | null;
  readonly phone: string | null;
  readonly stock: string | null;
  readonly homepage: string | null;
}

/** Who to look up: a company's website domain, its name, or a work email at it. */
export type BrandQuery =
  | { readonly domain: string }
  | { readonly name: string }
  | { readonly email: string };

/**
 * context.dev for the agent's CRM tools (ADR 0018): a company profile, and any page as Markdown.
 * The key stays in the API; the agent calls these through the MCP gateway.
 */
export interface WebReader {
  /** `POST /brand/retrieve` (10 credits, free when no brand is found). Null when none is found. */
  readonly lookup: (query: BrandQuery) => Promise<Omit<BrandResearch, "homepage"> | null>;
  /**
   * `POST /people/enrich` (20 credits per match, beta): the best candidate for a person, with
   * context.dev's identity-match score. Null when it finds none or the clues aren't enough.
   */
  readonly findPerson: (query: PersonQuery) => Promise<PersonMatch | null>;
  /** `GET /web/scrape/markdown` (1 credit): the page's main content, cut at `maxChars`. */
  readonly readPage: (url: string, maxChars?: number) => Promise<string | null>;
}

/**
 * What we know about a person. context.dev needs a work email, a profile URL, or a first and
 * last name with a company.
 */
export interface PersonQuery {
  readonly email?: string | null | undefined;
  readonly profileUrls?: readonly string[] | undefined;
  readonly firstName?: string | null | undefined;
  readonly lastName?: string | null | undefined;
  readonly companyName?: string | null | undefined;
  readonly companyDomain?: string | null | undefined;
}

export interface PersonRole {
  readonly title: string;
  readonly company: string;
  readonly domain: string | null;
  /** "2019" or "2019–2022". */
  readonly years: string | null;
}

/** context.dev's best candidate for a person. Weak candidates come back too: read `score`. */
export interface PersonMatch {
  /** How sure context.dev is that this is the person, from 0 to 100. */
  readonly score: number;
  readonly name: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  /** A photo on context.dev's media host (`https://media.brand.dev/pfp/…`). */
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly location: {
    readonly display: string | null;
    readonly city: string | null;
    readonly region: string | null;
    readonly country: string | null;
    readonly countryCode: string | null;
  } | null;
  readonly socialUrls: readonly string[];
  readonly websiteUrls: readonly string[];
  /** Null when their current role is unknown or they have none. */
  readonly currentRole: (PersonRole & { readonly since: string | null }) | null;
  readonly experience: readonly PersonRole[];
}

/** The host context.dev serves person photos from; the only one the API copies photos from. */
export const PERSON_PHOTO_PATTERN = /^https:\/\/media\.brand\.dev\/pfp\/[0-9a-f-]{36}(?:\.png)?$/;

export interface CompanyResearcher {
  /**
   * Public facts about the company at a website: `POST /brand/retrieve` (10 credits) and
   * `GET /web/scrape/markdown` of the home page (1 credit). Null when the domain isn't one or
   * context.dev found neither.
   */
  readonly research: (website: string) => Promise<BrandResearch | null>;
}

const text = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);

/** One line of an address; a value that isn't text reads as missing. */
const addressPart = text.catch(null);

const Full = z.object({
  brand: z
    .object({
      domain: text,
      title: text,
      description: text,
      slogan: text,
      email: text,
      phone: text,
      socials: z
        .array(z.object({ type: z.string().nullish(), url: z.string().nullish() }))
        .nullish(),
      address: z
        .object({
          street: addressPart,
          city: addressPart,
          state_province: addressPart,
          postal_code: addressPart,
          country: addressPart,
        })
        .nullish(),
      stock: z.object({ ticker: text, exchange: text }).nullish(),
      industries: z
        .object({
          eic: z.array(z.object({ industry: text, subindustry: text })).nullish(),
        })
        .nullish(),
      links: z.record(z.string(), z.string().nullish()).nullish(),
    })
    .nullish(),
});

const Markdown = z.object({ markdown: z.string().nullish() });

const ADDRESS_PARTS = ["street", "city", "state_province", "postal_code", "country"] as const;

type Brand = NonNullable<z.infer<typeof Full>["brand"]>;

function addressOf(address: Brand["address"]) {
  if (!address) return null;

  const parts = ADDRESS_PARTS.flatMap((key) => {
    const value = address[key];

    return value ? [value] : [];
  });

  return parts.length > 0 ? parts.join(", ") : null;
}

function https(url: string | null | undefined): url is string {
  return !!url?.startsWith("https://");
}

function researchOf(domain: string, brand: Brand | null, homepage: string | null): BrandResearch {
  return {
    domain,
    name: brand?.title ?? null,
    description: brand?.description ?? null,
    slogan: brand?.slogan ?? null,
    industries: (brand?.industries?.eic ?? []).flatMap((entry) =>
      entry.industry ? [[entry.industry, entry.subindustry].filter(Boolean).join(" — ")] : [],
    ),
    address: addressOf(brand?.address),
    socials: (brand?.socials ?? []).flatMap((social) =>
      social.type && https(social.url) ? [{ type: social.type, url: social.url }] : [],
    ),
    links: Object.fromEntries(
      Object.entries(brand?.links ?? {}).filter((entry): entry is [string, string] =>
        https(entry[1]),
      ),
    ),
    email: brand?.email ?? null,
    phone: brand?.phone ?? null,
    stock: brand?.stock?.ticker
      ? [brand.stock.ticker, brand.stock.exchange].filter(Boolean).join(" on ")
      : null,
    homepage,
  };
}

const PartialDate = z.object({ year: z.number() }).nullish();

const Organization = z.object({ name: z.string(), domain: z.string().nullish() });

const Role = z.object({
  title: z.string(),
  organization: Organization,
  start_date: PartialDate,
  end_date: PartialDate,
});

const Person = z.object({
  name: z.object({ full: text, first: text, last: text }).partial().nullish(),
  email: text,
  avatar_url: text,
  bio: text,
  location: z
    .object({ display: text, city: text, region: text, country: text, country_code: text })
    .partial()
    .nullish(),
  social_urls: z.array(z.string()).nullish(),
  website_urls: z.array(z.string()).nullish(),
  current_role: Role.nullish().catch(null),
  experience: z.array(Role.catch({ title: "", organization: { name: "" } })).nullish(),
});

const Enriched = z.object({
  match: z.object({
    status: z.string(),
    score: z.number().nullish(),
    person: Person.nullish(),
  }),
});

type Role = z.infer<typeof Role>;

const yearsOf = (role: Role) => {
  const start = role.start_date?.year;
  const end = role.end_date?.year;

  if (!start) return end ? String(end) : null;

  return end && end !== start ? `${start}–${end}` : String(start);
};

const roleOf = (role: Role): PersonRole => ({
  title: role.title,
  company: role.organization.name,
  domain: role.organization.domain ?? null,
  years: yearsOf(role),
});

/** `POST /people/enrich`'s body, as far as we send it. */
interface PersonRequestBody {
  email?: string;
  social_urls?: string[];
  name?: { first: string; last: string };
  company?: PersonCompany;
}

interface PersonCompany {
  name?: string;
  domain?: string;
}

/** The request body for a person, or null when the clues aren't enough for context.dev. */
export function personRequest(query: PersonQuery) {
  const email = query.email?.trim() || null;
  const urls = (query.profileUrls ?? []).filter((url) => url.startsWith("https://")).slice(0, 20);
  const first = query.firstName?.trim() || null;
  const last = query.lastName?.trim() || null;
  const companyName = query.companyName?.trim().slice(0, 200) || null;
  const companyDomain = query.companyDomain ? brandDomain(query.companyDomain) : null;
  const named = first !== null && last !== null;

  if (!email && urls.length === 0 && !(named && (companyName || companyDomain))) return null;

  const body: PersonRequestBody = {};
  const company: PersonCompany = {};

  if (email) body.email = email;

  if (urls.length > 0) body.social_urls = urls;

  if (named) body.name = { first: first.slice(0, 100), last: last.slice(0, 100) };

  if (companyName) company.name = companyName;

  if (companyDomain) company.domain = companyDomain;

  if (companyName || companyDomain) body.company = company;

  return body;
}

export function createContextDev({
  apiKey,
  fetch: fetchImpl = fetch,
  timeoutMs = 20_000,
}: ContextDevOptions): BrandLogos & CompanyResearcher & WebReader {
  const headers = { authorization: `Bearer ${apiKey}`, accept: "application/json" };

  /** A context.dev JSON body, or null on any failure: research is best effort. */
  const get = async <T>(schema: z.ZodType<T>, url: string, init: RequestInit = {}) => {
    try {
      const requestHeaders = new Headers(headers);

      if (init.body) requestHeaders.set("content-type", "application/json");

      const response = await fetchImpl(url, {
        ...init,
        headers: requestHeaders,
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) return null;

      const parsed = schema.safeParse(await response.json());

      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  return {
    async lookup(query) {
      let body: Record<string, string> | null = null;

      if ("domain" in query) {
        const domain = brandDomain(query.domain);

        if (domain) body = { type: "by_domain", domain };
      } else if ("name" in query) {
        const name = query.name.trim();

        // context.dev looks names up between 3 and 30 characters.
        if (name.length >= 3 && name.length <= 30) body = { type: "by_name", name };
      } else if (query.email.includes("@")) {
        body = { type: "by_email", email: query.email.trim() };
      }

      if (!body) return null;

      const full = await get(Full, `${BASE}/brand/retrieve`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!full?.brand) return null;

      const { homepage: _homepage, ...profile } = researchOf(
        "domain" in body ? (body["domain"] ?? "") : (full.brand.domain ?? ""),
        full.brand,
        null,
      );

      return profile;
    },

    async findPerson(query) {
      const body = personRequest(query);

      if (!body) return null;

      const result = await get(Enriched, `${BASE}/people/enrich`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const person = result?.match.status === "candidate" ? result.match.person : null;

      if (!person || result?.match.score == null) return null;

      const current = person.current_role ?? null;
      const location = person.location ?? null;

      return {
        score: result.match.score,
        name: person.name?.full ?? null,
        firstName: person.name?.first ?? null,
        lastName: person.name?.last ?? null,
        email: person.email,
        avatarUrl:
          person.avatar_url && PERSON_PHOTO_PATTERN.test(person.avatar_url)
            ? person.avatar_url
            : null,
        bio: person.bio,
        location: location
          ? {
              display: location.display ?? null,
              city: location.city ?? null,
              region: location.region ?? null,
              country: location.country ?? null,
              countryCode: location.country_code ?? null,
            }
          : null,
        socialUrls: person.social_urls ?? [],
        websiteUrls: person.website_urls ?? [],
        currentRole: current
          ? {
              ...roleOf(current),
              since: current.start_date ? String(current.start_date.year) : null,
            }
          : null,
        experience: (person.experience ?? [])
          .filter((role) => role.title && role.organization.name)
          .slice(0, 8)
          .map(roleOf),
      };
    },

    async readPage(url, maxChars = 40_000) {
      if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) return null;

      const page = await get(
        Markdown,
        `${BASE}/web/scrape/markdown?${new URLSearchParams({ url, useMainContentOnly: "true" })}`,
      );

      const markdown = page?.markdown?.trim();

      if (!markdown) return null;

      return markdown.length > maxChars ? `${markdown.slice(0, maxChars)}\n\n[cut]` : markdown;
    },

    async research(website) {
      const domain = brandDomain(website);

      if (!domain) return null;

      const [full, page] = await Promise.all([
        get(Full, `${BASE}/brand/retrieve`, {
          method: "POST",
          body: JSON.stringify({ type: "by_domain", domain }),
        }),
        get(
          Markdown,
          `${BASE}/web/scrape/markdown?${new URLSearchParams({
            url: `https://${domain}`,
            useMainContentOnly: "true",
            includeLinks: "false",
          })}`,
        ),
      ]);

      const homepage = page?.markdown?.trim() || null;

      if (!full?.brand && !homepage) return null;

      return researchOf(domain, full?.brand ?? null, homepage);
    },

    async iconUrls(value) {
      const domain = brandDomain(value);

      if (!domain) return [];

      try {
        const response = await fetchImpl(`${API}?domain=${encodeURIComponent(domain)}`, {
          headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });

        // 400 NOT_FOUND (no brand) is free and normal; anything else is also "no logo".
        if (!response.ok) return [];

        const parsed = Simplified.safeParse(await response.json());
        const logos = parsed.success ? (parsed.data.brand?.logos ?? []) : [];

        return logos
          .filter((logo) => logo.type === "icon" && logo.url.startsWith("https://"))
          .toSorted(compare)
          .map((logo) => logo.url);
      } catch {
        return [];
      }
    },
  };
}
