import { describe, expect, test } from "bun:test";
import { chatFileType, createChatFiles } from "./chat-files.ts";
import { createMemoryStorage } from "./memory.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);
const text = (value: string) => new TextEncoder().encode(value);

describe("chat files", () => {
  test("bytes must match the name: documents, sheets, images and text", () => {
    expect(chatFileType(text("%PDF-1.7"), "Invoice.PDF")).toBe("application/pdf");
    expect(chatFileType(ZIP, "Plan.xlsx")).toContain("spreadsheetml");
    expect(chatFileType(ZIP, "Memo.doc")).toBeNull();
    expect(chatFileType(text("name,arr\nAcme,10"), "accounts.csv")).toBe("text/csv");
    expect(chatFileType(PNG, "shot.jpg")).toBeNull();
    expect(chatFileType(text("<script>alert(1)</script>"), "page.html")).toBeNull();
    expect(chatFileType(new Uint8Array([0xff, 0xfe, 0, 0x41]), "notes.txt")).toBeNull();
  });

  test("through the API: stored under a key no one can guess, with its extension", async () => {
    const files = createChatFiles({ storage: createMemoryStorage(), maxBytes: 64 });

    expect(await files.start("cht_1", "shot.png", 10)).toEqual({ kind: "api" });
    expect(await files.start("cht_1", "shot.png", 65)).toBeNull();
    expect(await files.start("cht_1", "page.html", 10)).toBeNull();

    const first = await files.store("cht_1", "shot.png", PNG);
    const second = await files.store("cht_1", "shot.png", PNG);

    expect(first?.mediaType).toBe("image/png");
    expect(first?.url).toContain("chat-files/cht_1/");
    expect(first?.url.endsWith(".png")).toBe(true);
    expect(second?.url).not.toBe(first?.url);
    expect(await files.store("cht_1", "big.png", new Uint8Array(65))).toBeNull();
  });

  test("a browser upload counts only in its chat's folder, and a bad one is deleted", async () => {
    const storage = createMemoryStorage();

    const stored = await storage.put("chat-files/cht_1/a.pdf", text("not a pdf"), {
      contentType: "application/pdf",
    });

    const good = await storage.put("chat-files/cht_1/b.pdf", text("%PDF-1.7"), {
      contentType: "application/pdf",
    });

    const read = async (url: string) => {
      const key = storage.keyOf(url);
      const object = key ? storage.read(key) : null;

      return object ? new Response(object.bytes.slice()) : new Response(null, { status: 404 });
    };

    const files = createChatFiles({ storage, fetch: read });

    expect(await files.confirm("cht_1", "b.pdf", good.url)).toEqual({
      url: good.url,
      mediaType: "application/pdf",
    });
    expect(await files.confirm("cht_2", "b.pdf", good.url)).toBeNull();
    expect(await files.confirm("cht_1", "a.pdf", stored.url)).toBeNull();
    expect(storage.read("chat-files/cht_1/a.pdf")).toBeNull();
  });
});
