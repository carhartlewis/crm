import { describe, expect, test } from "bun:test";
import { brandDomain, createContextDev, type BrandFetch } from "@crm/core/brand";

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
