import { describe, expect, test } from "bun:test";
import { isChatFileUrl } from "./chat-files.ts";

describe("chat file URLs", () => {
  test("only the CRM's stored chat files are fetched", () => {
    expect(isChatFileUrl("https://abc.public.blob.vercel-storage.com/chat-files/cht_1/x.pdf")).toBe(
      true,
    );
    expect(isChatFileUrl("http://127.0.0.1:59000/crm/public/chat-files/cht_1/x.png")).toBe(true);
    expect(isChatFileUrl("http://127.0.0.1:59000/crm/public/users/u1/avatar")).toBe(false);
    expect(isChatFileUrl("http://abc.public.blob.vercel-storage.com/chat-files/x.pdf")).toBe(false);
    expect(isChatFileUrl("https://evil.example/chat-files/x.pdf")).toBe(false);
    expect(isChatFileUrl("http://169.254.169.254/chat-files/x")).toBe(false);
  });
});
