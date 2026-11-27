import { describe, expect, test } from "bun:test";
import { CHAT_MODEL, pickModel, VISION_MODEL } from "./pick-model.ts";

describe("pickModel", () => {
  test("text-only chats use the fast model", () => {
    expect(pickModel([{ role: "user", content: "Who are our customers?" }])).toBe(CHAT_MODEL);
    expect(
      pickModel([{ role: "user", content: [{ type: "file", mediaType: "application/pdf" }] }]),
    ).toBe(CHAT_MODEL);
  });

  test("an attached image switches the chat to the vision model", () => {
    expect(
      pickModel([
        { role: "user", content: "Hi" },
        { role: "user", content: [{ type: "text" }, { type: "file", mediaType: "image/png" }] },
      ]),
    ).toBe(VISION_MODEL);
    expect(pickModel([{ role: "user", content: [{ type: "image" }] }])).toBe(VISION_MODEL);
  });
});
