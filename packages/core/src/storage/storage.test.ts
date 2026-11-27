import { describe, expect, test } from "bun:test";
import {
  avatarSource,
  contactPhotoSource,
  createImageCache,
  createMemoryStorage,
  createStorage,
} from "./index.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

/** A fetch that serves fixed responses by URL and records what was asked for. */
function fakeFetch(routes: Record<string, () => Response>) {
  const requested: string[] = [];

  const impl = async (url: string) => {
    requested.push(url);

    return routes[url]?.() ?? new Response(null, { status: 404 });
  };

  return { impl, requested };
}

describe("memory storage", () => {
  test("keeps an object and gives its URL", async () => {
    const storage = createMemoryStorage();
    const stored = await storage.put("users/u1/avatar", PNG, { contentType: "image/png" });

    expect(stored).toEqual({ key: "users/u1/avatar", url: "memory://storage/users/u1/avatar" });
    expect(storage.read("users/u1/avatar")).toEqual({ bytes: PNG, contentType: "image/png" });
    expect(storage.isStored(stored.url)).toBe(true);
    expect(storage.isStored("https://lh3.googleusercontent.com/a/x")).toBe(false);

    await storage.delete("users/u1/avatar");

    expect(storage.read("users/u1/avatar")).toBeNull();
  });

  test("refuses a key that can leave its folder", async () => {
    const storage = createMemoryStorage();

    for (const key of ["", "/a.png", "a/../b.png", "a//b.png", "a\\b.png"]) {
      // oxlint-disable-next-line no-await-in-loop -- each key is checked on its own.
      await expect(storage.put(key, PNG, { contentType: "image/png" })).rejects.toThrow(
        /storage key/,
      );
    }
  });
});

describe("s3 storage", () => {
  test("recognises its own public URLs", () => {
    const storage = createStorage({
      driver: "s3",
      bucket: "crm",
      endpoint: "http://localhost:59000",
      region: "us-east-1",
      publicUrl: "http://localhost:59000/crm/",
    });

    expect(storage.isStored("http://localhost:59000/crm/public/users/u1/avatar?v=1")).toBe(true);
    expect(storage.isStored("http://localhost:59000/other/public/x")).toBe(false);
  });
});

describe("vercel blob storage", () => {
  test("recognises public blob URLs", () => {
    const storage = createStorage({ driver: "vercel-blob", token: "vercel_blob_rw_x" });

    expect(storage.isStored("https://abc.public.blob.vercel-storage.com/users/u1/avatar")).toBe(
      true,
    );
    expect(storage.isStored("https://example.com/users/u1/avatar")).toBe(false);
  });
});

describe("image cache", () => {
  test("copies a Google avatar at 256px and versions the URL", async () => {
    const storage = createMemoryStorage();

    const { impl, requested } = fakeFetch({
      "https://lh3.googleusercontent.com/a/abc=s256-c": () => new Response(PNG),
    });

    const images = createImageCache({ storage, fetch: impl });

    const url = await images.avatar("u1", "https://lh3.googleusercontent.com/a/abc=s96-c");

    expect(requested).toEqual(["https://lh3.googleusercontent.com/a/abc=s256-c"]);
    expect(url).toMatch(/^memory:\/\/storage\/users\/u1\/avatar\?v=[0-9a-f]{16}$/);
    expect(storage.read("users/u1/avatar")?.contentType).toBe("image/png");
  });

  test("stores a favicon once per host, from Google's favicon service", async () => {
    const storage = createMemoryStorage();

    const { impl, requested } = fakeFetch({
      "https://www.google.com/s2/favicons?domain=acme.com&sz=128": () => new Response(PNG),
    });

    const images = createImageCache({ storage, fetch: impl });

    const url = await images.favicon("https://acme.com/about");

    expect(requested).toEqual(["https://www.google.com/s2/favicons?domain=acme.com&sz=128"]);
    expect(url).toStartWith("memory://storage/favicons/acme.com?v=");
  });

  test("returns null when the site has no favicon", async () => {
    const images = createImageCache({ storage: createMemoryStorage(), fetch: fakeFetch({}).impl });

    expect(await images.favicon("https://no-icon.example")).toBeNull();
  });

  test("refuses SVGs and anything that isn't a known raster image", async () => {
    const storage = createMemoryStorage();

    const { impl } = fakeFetch({
      "https://lh3.googleusercontent.com/a/svg": () =>
        new Response(SVG, { headers: { "content-type": "image/png" } }),
    });

    const images = createImageCache({ storage, fetch: impl });

    expect(await images.avatar("u1", "https://lh3.googleusercontent.com/a/svg")).toBeNull();
    expect(storage.read("users/u1/avatar")).toBeNull();
  });

  test("refuses an image over the size limit", async () => {
    const storage = createMemoryStorage();

    const { impl } = fakeFetch({
      "https://lh3.googleusercontent.com/a/big": () => new Response(new Uint8Array(2048).fill(1)),
    });

    const images = createImageCache({ storage, fetch: impl, maxBytes: 1024 });

    expect(await images.avatar("u1", "https://lh3.googleusercontent.com/a/big")).toBeNull();
  });

  test("keeps a contact photo at full size, past the smaller image limit", async () => {
    const storage = createMemoryStorage();
    const photo = new Uint8Array(4096);
    photo.set(PNG);

    const { impl } = fakeFetch({
      "https://media.brand.dev/pfp/p.png": () => new Response(photo),
      "https://media.brand.dev/pfp/huge.png": () => new Response(new Uint8Array(8192).fill(1)),
    });

    const images = createImageCache({ storage, fetch: impl, maxBytes: 1024, photoMaxBytes: 4096 });

    expect(await images.contactPhoto("c1", "https://media.brand.dev/pfp/p.png")).toStartWith(
      "memory://storage/contacts/c1/photo?v=",
    );
    expect(await images.contactPhoto("c2", "https://media.brand.dev/pfp/huge.png")).toBeNull();
  });

  test("copies contact photos only from the person photo hosts", () => {
    expect(
      contactPhotoSource("https://media.licdn.com/dms/image/v2/abc/photo?e=1&t=x"),
    ).toStartWith("https://media.licdn.com/dms/image/");
    expect(contactPhotoSource("https://img.imagecdn.dev/profile/abc.jpeg")).not.toBeNull();
    expect(contactPhotoSource("https://media.brand.dev/pfp/abc.png")).not.toBeNull();
    // LinkedIn's blank default avatar lives on another host and is not a photo of them.
    expect(contactPhotoSource("https://static.licdn.com/aero-v1/sc/h/abc")).toBeNull();
    expect(contactPhotoSource("https://media.licdn.com/elsewhere/abc")).toBeNull();
    expect(contactPhotoSource("http://media.licdn.com/dms/image/abc")).toBeNull();
    expect(contactPhotoSource("https://evil.example/dms/image/abc")).toBeNull();
  });

  test("never fetches a non-https avatar", () => {
    expect(avatarSource("http://169.254.169.254/latest")).toBeNull();
    expect(avatarSource("not a url")).toBeNull();
  });
});

describe("image cache logos", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");

  function setup(sources: readonly string[]) {
    const storage = createMemoryStorage();
    const fetched: string[] = [];

    const images = createImageCache({
      storage,
      logoSources: async () => sources,
      fetch: async (url) => {
        fetched.push(url);

        if (url.endsWith(".svg")) return new Response(svg);

        if (url.includes("favicons")) return new Response(png);

        return url.endsWith("good.png") ? new Response(png) : new Response(null, { status: 404 });
      },
    });

    return { images, fetched };
  }

  test("stores the first raster logo, skipping SVGs and dead links", async () => {
    const { images, fetched } = setup([
      "https://media.test/icon.svg",
      "https://media.test/gone.png",
      "https://media.test/good.png",
    ]);

    const url = await images.logo("https://www.acme.com/about");

    expect(url).toContain("logos/www.acme.com");
    expect(fetched).toEqual([
      "https://media.test/icon.svg",
      "https://media.test/gone.png",
      "https://media.test/good.png",
    ]);
  });

  test("falls back to the favicon when no logo stores", async () => {
    const { images } = setup(["https://media.test/icon.svg"]);

    expect(await images.logo("https://acme.com")).toContain("favicons/acme.com");
    expect(await images.logo("not a url")).toBeNull();
  });
});
