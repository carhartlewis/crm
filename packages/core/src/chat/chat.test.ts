import { describe, expect, test } from "bun:test";
import { createId, ID_PREFIXES } from "../ids/index.ts";
import {
  CHAT_FILE_BYTES,
  chatFileTypeOf,
  chatTitlePrompt,
  cleanGeneratedTitle,
  TITLE_NEEDS_REPLY,
  callDecision,
  callKind,
  decodeStoredLayout,
  normalizeChatTitle,
  normalizeSpaceName,
  parsePinKey,
  parseSidebarLayout,
  titleFromMessage,
} from "./index.ts";

const chat = () => createId(ID_PREFIXES.chat);
const folder = () => createId(ID_PREFIXES.folder);

describe("chat titles", () => {
  test("a short first line becomes the title as written", () => {
    expect(titleFromMessage("  Who signs off on budget at Acme?\nMore detail")).toBe(
      "Who signs off on budget at Acme?",
    );
  });

  test("a long first line is cut at a word with an ellipsis", () => {
    const title = titleFromMessage(
      "Look through these meeting notes and update slide fourteen with the new story we agreed",
    );

    expect(title).toBe("Look through these meeting notes and update slide fourteen…");
    expect(title.length).toBeLessThanOrEqual(61);
  });

  test("an empty message gives a placeholder title", () => {
    expect(titleFromMessage("   ")).toBe("New chat");
  });

  test("titles and space names are trimmed and limited", () => {
    expect(normalizeChatTitle("  Q4   forecast ")).toEqual({ ok: true, value: "Q4 forecast" });
    expect(normalizeChatTitle(" ").ok).toBe(false);
    expect(normalizeSpaceName("x".repeat(61)).ok).toBe(false);
  });
});

describe("sidebar layout", () => {
  test("pin keys name a page, a space or a chat with a valid id", () => {
    const id = chat();

    expect(parsePinKey(`chat:${id}`)).toEqual({ kind: "chat", id });
    expect(parsePinKey("page:companies")).toEqual({ kind: "page", id: "companies" });
    expect(parsePinKey("chat:nope")).toBeUndefined();
    expect(parsePinKey("record:companies")).toBeUndefined();
  });

  test("bad pins, duplicates and malformed folders are dropped", () => {
    const a = chat();
    const b = chat();
    const first = folder();
    const second = folder();

    const layout = parseSidebarLayout(
      ["page:companies", `chat:${a}`, `chat:${a}`, "space:bad"],
      [
        { id: first, name: " Renewals ", chatIds: [a, "x", a] },
        { id: second, name: "Later", chatIds: [a, b] },
        { id: first, name: "Duplicate", chatIds: [] },
        { id: "fld_short", name: "Bad id", chatIds: [] },
      ],
      [b, "x", a, b],
    );

    expect(layout).toEqual({
      pinned: ["page:companies", `chat:${a}`],
      folders: [
        { id: first, name: "Renewals", chatIds: [a] },
        // A chat sits in one folder only: the first that lists it.
        { id: second, name: "Later", chatIds: [b] },
      ],
      // The Recents order keeps valid chat ids once each, in order.
      recent: [b, a],
    });
  });

  test("a malformed stored row reads as an empty layout", () => {
    expect(
      decodeStoredLayout({ pinned: null, folders: { folders: [] }, recent_order: "bad" }),
    ).toEqual({ pinned: [], folders: [], recent: [] });
    expect(decodeStoredLayout({ pinned: ["page:companies"], folders: [] }).pinned).toEqual([
      "page:companies",
    ]);
  });
});

describe("permission modes", () => {
  test("reads run in every mode", () => {
    for (const mode of ["plan", "manual", "auto", "bypass"] as const) {
      expect(callDecision(mode, callKind("list_companies", { readOnlyHint: true }))).toBe("run");
    }
  });

  test("a plain change asks in Manual and runs in Auto and Bypass", () => {
    const kind = callKind("create_company", { readOnlyHint: false, destructiveHint: false });

    expect(kind).toBe("change");
    expect(callDecision("manual", kind)).toBe("ask");
    expect(callDecision("auto", kind)).toBe("run");
    expect(callDecision("bypass", kind)).toBe("run");
  });

  test("Plan refuses every change, so the agent proposes it instead", () => {
    expect(callDecision("plan", "change")).toBe("refuse");
    expect(callDecision("plan", "risky")).toBe("refuse");
  });

  test("a risky call asks unless the chat bypasses, where it runs marked", () => {
    const kind = callKind("forget", { readOnlyHint: false, destructiveHint: true });

    expect(kind).toBe("risky");
    expect(callDecision("auto", kind)).toBe("ask");
    expect(callDecision("bypass", kind)).toBe("run_flagged");
  });

  test("names beat annotations, and missing annotations are risky", () => {
    expect(callKind("send_email", { readOnlyHint: true })).toBe("risky");
    expect(callKind("get_api_keys", { readOnlyHint: true })).toBe("risky");
    expect(callKind("search_threads", undefined)).toBe("risky");
  });
});

describe("generated chat titles", () => {
  test("keep one clean line", () => {
    expect(cleanGeneratedTitle('"Customer list review."\n')).toBe("Customer list review");
    expect(cleanGeneratedTitle("Title: Q4 pipeline")).toBe("Q4 pipeline");
    expect(cleanGeneratedTitle("   ")).toBeUndefined();
    expect(cleanGeneratedTitle("x".repeat(80))?.length).toBe(60);
  });

  test("the prompt names attached files, and says so when there are none", () => {
    expect(
      chatTitlePrompt({ message: "Whats this", filenames: ["TaxInvoice-1614320.pdf"] }),
    ).toContain("Attached files: TaxInvoice-1614320.pdf");
    expect(chatTitlePrompt({ message: "Hi" })).toContain("Attached files: none");
  });

  test("a vague message may wait for the reply; the second prompt carries the reply", () => {
    const first = chatTitlePrompt({ message: "Who is this person?" });

    const second = chatTitlePrompt({
      message: "Who is this person?",
      reply: "Nathan Owen is a General Partner at Grand Ventures.",
    });

    expect(first).toContain(`reply with ${TITLE_NEEDS_REPLY} only`);
    expect(first).not.toContain("Reply:");
    expect(second).toContain("Reply: Nathan Owen is a General Partner");
    expect(second).not.toContain(TITLE_NEEDS_REPLY + " only");
  });
});

describe("chat files", () => {
  test("documents, sheets, images and text by extension; nothing else", () => {
    expect(chatFileTypeOf("Series A Diligence.PDF")).toBe("application/pdf");
    expect(chatFileTypeOf("Plan.xlsx")).toContain("spreadsheetml");
    expect(chatFileTypeOf("notes.md")).toBe("text/plain");
    expect(chatFileTypeOf("page.html")).toBeNull();
    expect(chatFileTypeOf("logo.svg")).toBeNull();
    expect(chatFileTypeOf("README")).toBeNull();
    expect(CHAT_FILE_BYTES).toBe(30 * 1024 * 1024);
  });
});
