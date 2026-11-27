import { describe, expect, test } from "bun:test";
import { chatNotice, newQuestion, shouldNotify } from "./chat-notify.ts";

const asked = (at: string) => ({
  type: "interaction.opened",
  data: { interactionId: "i1", request: { kind: "question", prompt: "Send it?" } },
  meta: { at },
});

describe("chat notifications", () => {
  test("a finished reply shows the chat's title and the reply's first line, without markdown", () => {
    expect(chatNotice("finished", "Acme renewal", "\n## **Done.** Three companies\nmore")).toEqual({
      title: "Acme renewal",
      body: "Done. Three companies",
    });
  });

  test("a question says the chat needs you, and long text is cut short", () => {
    const notice = chatNotice("input", "Research", "x".repeat(300));

    expect(notice.title).toBe("Research needs you");
    expect(notice.body).toHaveLength(140);
    expect(notice.body.endsWith("…")).toBe(true);
    expect(chatNotice("input", "Research", "").body).toBe("The assistant needs your input.");
  });

  test("only while the window is in the background", () => {
    expect(shouldNotify({ hidden: true, hasFocus: () => true })).toBe(true);
    expect(shouldNotify({ hidden: false, hasFocus: () => false })).toBe(true);
    expect(shouldNotify({ hidden: false, hasFocus: () => true })).toBe(false);
  });

  test("a question asked after the chat opened counts; catch-up and other events don't", () => {
    const since = Date.parse("2026-11-27T10:00:00Z");

    expect(newQuestion(asked("2026-11-27T10:00:05Z"), since)).toBe("Send it?");
    expect(newQuestion(asked("2026-11-27T09:59:00Z"), since)).toBeNull();
    const started = { type: "turn.started", meta: { at: "x" } };

    expect(newQuestion(started, since)).toBeNull();
  });
});
