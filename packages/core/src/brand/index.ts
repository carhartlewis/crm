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

const API = "https://api.context.dev/v1/brand/retrieve-simplified";

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

export function createContextDev({
  apiKey,
  fetch: fetchImpl = fetch,
  timeoutMs = 20_000,
}: ContextDevOptions): BrandLogos {
  return {
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
