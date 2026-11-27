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

export function createContextDev({
  apiKey,
  fetch: fetchImpl = fetch,
  timeoutMs = 20_000,
}: ContextDevOptions): BrandLogos & CompanyResearcher {
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
