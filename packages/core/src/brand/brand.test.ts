import { describe, expect, test } from "bun:test";
import {
  BRAND_HIT_TTL_SECONDS,
  type BrandFetch,
  brandDomain,
  createContextDev,
  PAGE_TTL_SECONDS,
} from "@crm/core/brand";
import { createMemoryKv } from "@crm/core/kv";

const logos = [
  { url: "https://media.test/wide.svg", type: "logo", mode: "light", resolution: { width: 900 } },
  {
    url: "https://media.test/icon.svg",
    type: "icon",
    mode: "has_opaque_background",
    resolution: { width: 1024 },
  },
  { url: "https://media.test/small.png", type: "icon", mode: "light", resolution: { width: 128 } },
  { url: "https://media.test/big.png", type: "icon", mode: "light", resolution: { width: 512 } },
  {
    url: "https://media.test/opaque.png",
    type: "icon",
    mode: "has_opaque_background",
    resolution: { width: 64 },
  },
  {
    url: "http://media.test/insecure.png",
    type: "icon",
    mode: "light",
    resolution: { width: 2048 },
  },
];

/** context.dev for granola.ai, checking the request it gets. */
const granola: BrandFetch = async (url, init) => {
  expect(new URL(url).searchParams.get("domain")).toBe("granola.ai");
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer key-1");

  return Response.json({ status: "ok", brand: { logos } });
};

describe("context.dev icons", () => {
  test("asks with the key and orders square icons: raster, opaque, larger", async () => {
    const brand = createContextDev({ apiKey: "key-1", fetch: granola });

    expect(await brand.iconUrls("https://www.Granola.ai/pricing")).toEqual([
      "https://media.test/opaque.png",
      "https://media.test/big.png",
      "https://media.test/small.png",
      "https://media.test/icon.svg",
    ]);
  });

  test("returns nothing for unknown brands, errors, bad bodies and non-domains", async () => {
    let requests = 0;

    const answer =
      (response: () => Response): BrandFetch =>
      async () => {
        requests += 1;

        return response();
      };

    const notFound = createContextDev({
      apiKey: "k",
      fetch: answer(() => Response.json({ error_code: "NOT_FOUND" }, { status: 400 })),
    });

    const garbage = createContextDev({
      apiKey: "k",
      fetch: answer(() => Response.json({ brand: 1 })),
    });

    const down = createContextDev({
      apiKey: "k",
      fetch: async () => {
        throw new Error("offline");
      },
    });

    expect(await notFound.iconUrls("nobody.test")).toEqual([]);
    expect(await garbage.iconUrls("acme.test")).toEqual([]);
    expect(await down.iconUrls("acme.test")).toEqual([]);
    expect(await notFound.iconUrls("localhost")).toEqual([]);
    expect(requests).toBe(2);
  });

  test("brandDomain keeps bare hostnames only", () => {
    expect(brandDomain("https://www.acme.com/x")).toBe("acme.com");
    expect(brandDomain("acme.co.uk")).toBe("acme.co.uk");
    expect(brandDomain("127.0.0.1")).toBeNull();
    expect(brandDomain("not a domain")).toBeNull();
  });
});

describe("context.dev for the agent", () => {
  test("looks a company up by name and reads its profile", async () => {
    const bodies: unknown[] = [];

    const reader = createContextDev({
      apiKey: "key-1",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init.body)));

        return Response.json({
          brand: { domain: "acme.com", title: "Acme", description: "Rockets.", socials: [] },
        });
      },
    });

    expect(await reader.lookup({ name: "Acme" })).toMatchObject({
      domain: "acme.com",
      name: "Acme",
      description: "Rockets.",
    });
    expect(bodies).toEqual([{ type: "by_name", name: "Acme" }]);
  });

  test("refuses a lookup context.dev can't answer, without calling it", async () => {
    let calls = 0;

    const reader = createContextDev({
      apiKey: "key-1",
      fetch: async () => {
        calls += 1;

        return Response.json({});
      },
    });

    expect(await reader.lookup({ name: "AB" })).toBeNull();
    expect(await reader.lookup({ domain: "not a domain" })).toBeNull();
    expect(await reader.readPage("ftp://example.com/file")).toBeNull();
    expect(calls).toBe(0);
  });

  test("reads a page's main content and cuts it at the limit", async () => {
    const reader = createContextDev({
      apiKey: "key-1",
      fetch: async (url) => {
        expect(new URL(url).searchParams.get("url")).toBe("https://acme.com/pricing");

        return Response.json({ success: true, markdown: "# Pricing\n\nTwo plans." });
      },
    });

    expect(await reader.readPage("https://acme.com/pricing", 9)).toBe("# Pricing\n\n[cut]");
  });
});

describe("context.dev people", () => {
  const PHOTO = "https://media.brand.dev/pfp/0f8fad5b-d9cb-469f-a165-70867728950e.png";

  test("finds a person from a work email and reads their profile", async () => {
    const reader = createContextDev({
      apiKey: "k",
      fetch: async (url, init) => {
        expect(url).toBe("https://api.context.dev/v1/people/enrich");
        expect(JSON.parse(String(init.body))).toEqual({
          email: "ada@engines.test",
          company: { domain: "engines.test" },
        });

        return Response.json({
          request_id: "r1",
          match: {
            status: "candidate",
            score: 92,
            person: {
              name: { full: "Ada Lovelace", first: "Ada", last: "Lovelace" },
              avatar_url: PHOTO,
              location: { display: "London, UK", city: "London", country_code: "GB" },
              social_urls: ["https://www.linkedin.com/in/ada/"],
              current_role: {
                title: "Head of Analysis",
                organization: { name: "Engines", domain: "engines.test" },
                start_date: { year: 2021 },
              },
              experience: [
                {
                  title: "Analyst",
                  organization: { name: "Babbage & Co" },
                  start_date: { year: 2015 },
                  end_date: { year: 2021 },
                },
              ],
            },
          },
        });
      },
    });

    const person = await reader.findPerson({
      email: "ada@engines.test",
      companyDomain: "https://www.engines.test",
    });

    expect(person).toMatchObject({
      score: 92,
      name: "Ada Lovelace",
      avatarUrl: PHOTO,
      location: { city: "London", countryCode: "GB" },
      socialUrls: ["https://www.linkedin.com/in/ada/"],
      currentRole: { title: "Head of Analysis", company: "Engines", since: "2021" },
      experience: [{ title: "Analyst", company: "Babbage & Co", years: "2015–2021" }],
    });
  });

  test("drops photos from other hosts, and returns null when nothing matches", async () => {
    const answers = [
      {
        match: {
          status: "candidate",
          score: 40,
          person: { avatar_url: "https://evil.test/a.png" },
        },
      },
      { match: { status: "not_found", score: null, person: null } },
    ];

    const reader = createContextDev({
      apiKey: "k",
      fetch: async () => Response.json(answers.shift()),
    });

    expect((await reader.findPerson({ email: "a@b.test" }))?.avatarUrl).toBeNull();
    expect(await reader.findPerson({ email: "a@b.test" })).toBeNull();
  });

  test("refuses clues context.dev can't use, without calling it", async () => {
    const reader = createContextDev({
      apiKey: "k",
      fetch: async () => {
        throw new Error("no request expected");
      },
    });

    expect(await reader.findPerson({ firstName: "Ada", lastName: "Lovelace" })).toBeNull();
    expect(await reader.findPerson({ firstName: "Ada", companyName: "Engines" })).toBeNull();
  });
});

const redisDown = async () => {
  throw new Error("redis down");
};

/** A context.dev that answers with `respond` and counts its requests. */
function counted(respond: (url: string) => Response) {
  const requests: string[] = [];

  const fetch: BrandFetch = async (url) => {
    requests.push(url);

    return respond(url);
  };

  return { requests, fetch };
}

describe("context.dev cache", () => {
  const acme = { brand: { domain: "acme.com", title: "Acme", description: "Rockets." } };

  test("asks once for a domain, whichever client or method asks", async () => {
    const cache = createMemoryKv();

    const api = counted((url) =>
      url.includes("/scrape/") ? Response.json({ markdown: "# Acme" }) : Response.json(acme),
    );

    const first = createContextDev({ apiKey: "k", fetch: api.fetch, cache });
    const second = createContextDev({ apiKey: "k", fetch: api.fetch, cache });

    expect(await first.research("https://acme.com")).toMatchObject({ name: "Acme" });
    expect(await second.research("acme.com")).toMatchObject({ name: "Acme" });
    expect(await second.lookup({ domain: "www.acme.com" })).toMatchObject({ name: "Acme" });
    expect(api.requests).toHaveLength(2);
  });

  test("remembers 'not found', but asks again after an outage or a rate limit", async () => {
    const cache = createMemoryKv();
    let status = 404;

    const api = counted(() => Response.json({ error_code: "NOT_FOUND" }, { status }));
    const brand = createContextDev({ apiKey: "k", fetch: api.fetch, cache });

    expect(await brand.iconUrls("nobody.test")).toEqual([]);
    expect(await brand.iconUrls("nobody.test")).toEqual([]);
    expect(api.requests).toHaveLength(1);

    status = 503;
    expect(await brand.iconUrls("down.test")).toEqual([]);
    status = 429;
    expect(await brand.iconUrls("down.test")).toEqual([]);
    expect(api.requests).toHaveLength(3);
  });

  test("keeps pages for a day, brands for a month", async () => {
    let now = 0;
    const cache = createMemoryKv(() => now);

    const api = counted((url) =>
      url.includes("/scrape/") ? Response.json({ markdown: "Hello" }) : Response.json(acme),
    );

    const brand = createContextDev({ apiKey: "k", fetch: api.fetch, cache });

    await brand.readPage("https://acme.com/about");
    await brand.lookup({ domain: "acme.com" });
    now = (PAGE_TTL_SECONDS + 1) * 1000;
    await brand.readPage("https://acme.com/about");
    await brand.lookup({ domain: "acme.com" });
    expect(api.requests).toHaveLength(3);
    now = (BRAND_HIT_TTL_SECONDS + 1) * 1000;
    await brand.lookup({ domain: "acme.com" });
    expect(api.requests).toHaveLength(4);
  });

  test("works without Redis when Redis fails", async () => {
    const broken = { ...createMemoryKv(), get: redisDown, set: redisDown };
    const api = counted(() => Response.json(acme));
    const brand = createContextDev({ apiKey: "k", fetch: api.fetch, cache: broken });

    expect(await brand.lookup({ domain: "acme.com" })).toMatchObject({ name: "Acme" });
  });
});
