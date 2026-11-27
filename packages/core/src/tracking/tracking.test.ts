import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import {
  createTrackingKey,
  decodeCollect,
  decodeIdentify,
  identifyEmail,
  isTrackingKey,
  trackingSnippet,
  visitInput,
  visitSource,
  websiteRollup,
  type VisitRow,
} from "./index.ts";

const KEY = "trk_0123456789ABCDEFGHIJKLMN";

const visit = (path: string, at: string, extra: Partial<VisitRow> = {}): VisitRow => ({
  path,
  referrer: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  occurredAt: new Date(at),
  ...extra,
});

describe("tracking keys", () => {
  test("a new key has the prefix and 24 base62 characters", () => {
    const key = createTrackingKey();

    expect(isTrackingKey(key)).toBe(true);
    expect(key).toMatch(/^trk_[0-9A-Za-z]{24}$/);
  });

  test("the snippet points at the API's script with the key", () => {
    expect(trackingSnippet("https://crm.example.com", KEY)).toBe(
      `<script async src="https://crm.example.com/api/t/script.js" data-key="${KEY}"></script>`,
    );
  });
});

describe("collect validation", () => {
  test("refuses a missing or malformed key and visitor id", () => {
    expect(Option.isNone(decodeCollect({ visitor_id: "abcdefgh12", path: "/" }))).toBe(true);
    expect(Option.isNone(decodeCollect({ key: "nope", visitor_id: "abcdefgh12", path: "/" }))).toBe(
      true,
    );
    expect(Option.isNone(decodeCollect({ key: KEY, visitor_id: "short", path: "/" }))).toBe(true);
    expect(Option.isNone(decodeCollect({ key: KEY, visitor_id: "abc defgh12", path: "/" }))).toBe(
      true,
    );
  });

  test("keeps only the path, drops self-referrals and cleans UTM tags", () => {
    const decoded = decodeCollect({
      key: KEY,
      visitor_id: "visitor-0001",
      path: "/pricing?email=ana@acme.com#plans",
      host: "northwind.io",
      referrer: "https://northwind.io/blog",
      utm_source: "  linkedin ",
      utm_medium: "",
      utm_campaign: null,
      company_domain: "https://www.Acme.com/about",
    });

    expect(Option.isSome(decoded)).toBe(true);

    const input = visitInput(Option.getOrThrow(decoded));

    expect(input).toEqual({
      visitorId: "visitor-0001",
      path: "/pricing",
      referrer: null,
      utmSource: "linkedin",
      utmMedium: null,
      utmCampaign: null,
      companyDomain: "acme.com",
    });
  });

  test("an outside referrer loses its query; a non-http one is dropped", () => {
    const base = { key: KEY, visitor_id: "visitor-0001", path: "/" };

    expect(
      visitInput(
        Option.getOrThrow(
          decodeCollect({ ...base, referrer: "https://www.google.com/search?q=secret" }),
        ),
      ).referrer,
    ).toBe("https://www.google.com/search");
    expect(
      visitInput(Option.getOrThrow(decodeCollect({ ...base, referrer: "javascript:alert(1)" })))
        .referrer,
    ).toBeNull();
  });

  test("identify needs a key, a visitor id and an email", () => {
    expect(
      Option.isSome(decodeIdentify({ key: KEY, visitor_id: "visitor-0001", email: "a@b.co" })),
    ).toBe(true);
    expect(Option.isNone(decodeIdentify({ key: KEY, visitor_id: "visitor-0001" }))).toBe(true);
    expect(identifyEmail("  Ana@Acme.COM ")).toBe("ana@acme.com");
    expect(identifyEmail("not an email")).toBeNull();
  });
});

describe("visit sources", () => {
  test("UTM tags win over the referrer", () => {
    expect(
      visitSource({
        referrer: "https://google.com",
        utmSource: "linkedin",
        utmMedium: "social",
      }),
    ).toBe("linkedin · social");
  });

  test("known referrers are named, others are referrals, none is Direct", () => {
    expect(
      visitSource({ referrer: "https://www.google.co.uk", utmSource: null, utmMedium: null }),
    ).toBe("Google · organic");
    expect(
      visitSource({ referrer: "https://blog.acme.com/post", utmSource: null, utmMedium: null }),
    ).toBe("blog.acme.com · referral");
    expect(visitSource({ referrer: null, utmSource: null, utmMedium: null })).toBe("Direct");
  });
});

describe("websiteRollup", () => {
  test("is null without visits", () => {
    expect(websiteRollup([])).toBeNull();
  });

  test("counts views, finds the top page and the first and latest sources", () => {
    const activity = websiteRollup([
      visit("/pricing", "2026-08-03T10:00:00Z", { utmSource: "linkedin", utmMedium: "social" }),
      visit("/", "2026-05-01T09:00:00Z", { referrer: "https://www.google.com/search" }),
      visit("/pricing", "2026-07-01T09:00:00Z", { utmCampaign: "founder" }),
      visit("/docs", "2026-06-01T09:00:00Z"),
    ]);

    expect(activity).toEqual({
      views: 4,
      first_seen_at: "2026-05-01T09:00:00.000Z",
      last_seen_at: "2026-08-03T10:00:00.000Z",
      top_page: { path: "/pricing", views: 2 },
      original_source: "Google · organic",
      latest_source: "linkedin · social",
      campaign: "founder",
    });
  });

  test("a tie for top page goes to the page visited first", () => {
    const activity = websiteRollup([
      visit("/b", "2026-05-02T00:00:00Z"),
      visit("/a", "2026-05-01T00:00:00Z"),
    ]);

    expect(activity?.top_page).toEqual({ path: "/a", views: 1 });
  });
});
