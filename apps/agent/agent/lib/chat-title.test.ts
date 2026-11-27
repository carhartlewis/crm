import { describe, expect, test } from "bun:test";
import { nameChat } from "./chat-title.ts";

const turn = { sessionId: "ses_1", message: "What companies do we have?" };

describe("nameChat", () => {
  test("asks the model with the first message, and saves a clean title", async () => {
    const prompts: string[] = [];
    const saved: string[] = [];

    await nameChat(
      turn,
      {
        generate: async (prompt) => {
          prompts.push(prompt);

          return '"Company list."';
        },
        save: async (sessionId, title) => {
          saved.push(`${sessionId}: ${title}`);
        },
      },
      new AbortController().signal,
    );

    expect(prompts[0]).toContain("What companies do we have?");
    expect(saved).toEqual(["ses_1: Company list"]);
  });

  test("names attached files, so a vague message still gets a title", async () => {
    const prompts: string[] = [];

    await nameChat(
      { sessionId: "ses_1", message: "", filenames: ["TaxInvoice.pdf"] },
      {
        generate: async (prompt) => {
          prompts.push(prompt);

          return "HSS tax invoice";
        },
        save: async () => undefined,
      },
      new AbortController().signal,
    );

    expect(prompts[0]).toContain("TaxInvoice.pdf");
  });

  test("a model failure keeps the first title and never throws", async () => {
    const logged: string[] = [];

    await nameChat(
      turn,
      {
        generate: () => Promise.reject(new Error("gateway down")),
        save: () => Promise.reject(new Error("unreachable")),
        log: (message) => logged.push(message),
      },
      new AbortController().signal,
    );

    expect(logged).toEqual(["chat title: naming the chat failed"]);
  });
});
