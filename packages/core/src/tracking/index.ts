import { Option, Schema } from "effect";
import { normalizeCompanyDomain } from "../company/index.ts";

/**
 * Website tracking: the public snippet's paths, the shapes of what it sends, and the per-record
 * rollup the record sheets show. Client-safe; the API owns the writes.
 */

/** The snippet's script, served by the API (the app proxies `/api/*` to it). */
export const TRACKING_SCRIPT_PATH = "/api/t/script.js";

/** Page views from the snippet (`navigator.sendBeacon`, a text/plain JSON body). */
export const TRACKING_COLLECT_PATH = "/api/t/collect";

/** `window.crm.identify(email)`: links the browser's visits to the contact with that email. */
export const TRACKING_IDENTIFY_PATH = "/api/t/identify";

const KEY_PREFIX = "trk_";
const KEY_BODY_LENGTH = 24;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);
const KEY_PATTERN = /^trk_[0-9A-Za-z]{24}$/;
const VISITOR_PATTERN = /^[0-9A-Za-z_-]{8,64}$/;

const MAX_PATH = 2048;
const MAX_UTM = 200;

/**
 * A new public tracking key, such as `trk_0123456789ABCDEFGHIJKLMN`. It only says which
 * workspace a page view belongs to; it grants no read access. `random` is injectable for tests.
 */
export function createTrackingKey(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
) {
  let body = "";

  while (body.length < KEY_BODY_LENGTH) {
    for (const byte of random(new Uint8Array(KEY_BODY_LENGTH - body.length))) {
      if (byte < UNBIASED_LIMIT) body += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }

  return `${KEY_PREFIX}${body}`;
}

export function isTrackingKey(value: string) {
  return KEY_PATTERN.test(value);
}

/** The tag a workspace pastes into its website. `origin` is the app's origin. */
export function trackingSnippet(origin: string, key: string) {
  return `<script async src="${origin}${TRACKING_SCRIPT_PATH}" data-key="${key}"></script>`;
}

const Key = Schema.String.check(Schema.isPattern(KEY_PATTERN));
const VisitorId = Schema.String.check(Schema.isPattern(VISITOR_PATTERN));
const Loose = Schema.optional(Schema.NullOr(Schema.String));

/** One page view as the snippet sends it. Long values are cut, not refused. */
export const CollectPayload = Schema.Struct({
  key: Key,
  visitor_id: VisitorId,
  path: Schema.String,
  /** The page's host, so a referrer from the same site counts as no referrer. */
  host: Loose,
  referrer: Loose,
  utm_source: Loose,
  utm_medium: Loose,
  utm_campaign: Loose,
  /** Set by the site when it knows the visitor's company (`window.crm.company(domain)`). */
  company_domain: Loose,
});

export type CollectPayload = typeof CollectPayload.Type;

export const IdentifyPayload = Schema.Struct({
  key: Key,
  visitor_id: VisitorId,
  email: Schema.String.check(Schema.isMaxLength(320)),
});

export type IdentifyPayload = typeof IdentifyPayload.Type;

export const decodeCollect = Schema.decodeUnknownOption(CollectPayload);
export const decodeIdentify = Schema.decodeUnknownOption(IdentifyPayload);

/** A snippet body is small JSON sent as text/plain; anything larger is refused unread. */
export const MAX_TRACKING_BODY = 8 * 1024;

/** A page view from its request body; `null` when too long, not JSON or not valid. */
export function parseCollect(text: string): CollectPayload | null {
  if (!text || text.length > MAX_TRACKING_BODY) return null;

  try {
    return Option.getOrNull(decodeCollect(JSON.parse(text)));
  } catch {
    return null;
  }
}

/** An identify call from its request body; `null` when too long, not JSON or not valid. */
export function parseIdentify(text: string): IdentifyPayload | null {
  if (!text || text.length > MAX_TRACKING_BODY) return null;

  try {
    return Option.getOrNull(decodeIdentify(JSON.parse(text)));
  } catch {
    return null;
  }
}

/** A page view ready to store: the visit's columns, as the ORM names them. */
export interface VisitInput {
  readonly visitorId: string;
  readonly path: string;
  readonly referrer: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly companyDomain: string | null;
}

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

const shortText = (value: string | null | undefined) => {
  const text = value?.replaceAll(/\s+/g, " ").trim() ?? "";

  return text ? clip(text, MAX_UTM) : null;
};

/** An http(s) URL without its query and fragment, or `null`. */
function cleanReferrer(value: string | null | undefined, host: string | null) {
  if (!value) return null;

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (host && url.host.toLowerCase() === host.toLowerCase()) return null;

  return clip(`${url.origin}${url.pathname === "/" ? "" : url.pathname}`, MAX_PATH);
}

/** Only the path: no query (it can hold personal data) and no fragment. */
function cleanPath(value: string) {
  const path = value.split(/[?#]/)[0]?.trim() ?? "";

  return clip(path.startsWith("/") ? path : `/${path}`, MAX_PATH);
}

/** Normalises a decoded page view. */
export function visitInput(payload: CollectPayload): VisitInput {
  const domain = normalizeCompanyDomain(payload.company_domain ?? null);

  return {
    visitorId: payload.visitor_id,
    path: cleanPath(payload.path),
    referrer: cleanReferrer(payload.referrer, payload.host ?? null),
    utmSource: shortText(payload.utm_source),
    utmMedium: shortText(payload.utm_medium),
    utmCampaign: shortText(payload.utm_campaign),
    companyDomain: domain.ok ? domain.domain : null,
  };
}

/** A trimmed, lowercased email, or `null` when it isn't one. */
export function identifyEmail(value: string) {
  const email = value.trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The domain of an email address (`ana@northwind.io` → `northwind.io`). */
export function emailDomain(email: string) {
  return email.slice(email.lastIndexOf("@") + 1);
}

/** What the rollup reads of each stored visit. */
export interface VisitRow {
  readonly path: string;
  readonly referrer: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly occurredAt: Date;
}

/** Website activity for a company or a contact, as its Overview tab shows it. */
export const WebsiteActivity = Schema.Struct({
  views: Schema.Number,
  first_seen_at: Schema.String,
  last_seen_at: Schema.String,
  top_page: Schema.Struct({ path: Schema.String, views: Schema.Number }),
  /** Where the first visit came from, such as `Google · organic` or `Direct`. */
  original_source: Schema.String,
  /** Where the latest visit came from. */
  latest_source: Schema.String,
  /** The latest visit's campaign that had one. */
  campaign: Schema.NullOr(Schema.String),
});

export type WebsiteActivity = typeof WebsiteActivity.Type;

const NAMED_SOURCES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/(^|\.)google\.[a-z.]+$/, "Google", "organic"],
  [/(^|\.)bing\.com$/, "Bing", "organic"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo", "organic"],
  [/(^|\.)search\.yahoo\.com$/, "Yahoo", "organic"],
  [/(^|\.)ecosia\.org$/, "Ecosia", "organic"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT", "referral"],
  [/(^|\.)perplexity\.ai$/, "Perplexity", "referral"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn", "social"],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, "X", "social"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "Facebook", "social"],
  [/(^|\.)instagram\.com$/, "Instagram", "social"],
  [/(^|\.)reddit\.com$/, "Reddit", "social"],
  [/(^|\.)youtube\.com$/, "YouTube", "social"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News", "social"],
  [/(^|\.)github\.com$/, "GitHub", "referral"],
];

/** Where one visit came from: its UTM tags, else its referrer, else Direct. */
export function visitSource(visit: Pick<VisitRow, "referrer" | "utmSource" | "utmMedium">) {
  if (visit.utmSource) {
    return visit.utmMedium ? `${visit.utmSource} · ${visit.utmMedium}` : visit.utmSource;
  }

  if (!visit.referrer) return "Direct";

  let host: string;

  try {
    host = new URL(visit.referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "Direct";
  }

  const named = NAMED_SOURCES.find(([pattern]) => pattern.test(host));

  return named ? `${named[1]} · ${named[2]}` : `${host} · referral`;
}

/** Sums up a record's visits; `null` when there are none. */
export function websiteRollup(visits: readonly VisitRow[]): WebsiteActivity | null {
  const ordered = visits.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const first = ordered[0];
  const last = ordered.at(-1);

  if (!first || !last) return null;

  const pages = new Map<string, number>();

  for (const visit of ordered) pages.set(visit.path, (pages.get(visit.path) ?? 0) + 1);

  // Most views wins; on a tie, the page first visited earlier.
  let top = { path: first.path, views: 0 };

  for (const [path, views] of pages) {
    if (views > top.views) top = { path, views };
  }

  const campaign = ordered.findLast((visit) => visit.utmCampaign)?.utmCampaign ?? null;

  return {
    views: ordered.length,
    first_seen_at: first.occurredAt.toISOString(),
    last_seen_at: last.occurredAt.toISOString(),
    top_page: top,
    original_source: visitSource(first),
    latest_source: visitSource(last),
    campaign,
  };
}
