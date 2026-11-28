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

  test("a message that can't name the chat waits for the reply, then names it from both", async () => {
    const prompts: string[] = [];
    const saved: string[] = [];

    const options = {
      generate: async (prompt: string) => {
        prompts.push(prompt);

        return prompt.includes("Reply:") ? "Nathan Owen, Grand Ventures" : "?";
      },
      save: async (_sessionId: string, title: string) => {
        saved.push(title);
      },
    };

    const vague = { sessionId: "ses_1", message: "Who is this person?" };

    expect(await nameChat(vague, options, new AbortController().signal)).toBe("waiting");
    expect(saved).toEqual([]);

    expect(
      await nameChat(
        { ...vague, reply: "Nathan Owen is a General Partner at Grand Ventures." },
        options,
        new AbortController().signal,
      ),
    ).toBe("named");
    expect(prompts[1]).toContain("Reply: Nathan Owen");
    expect(saved).toEqual(["Nathan Owen, Grand Ventures"]);
  });

  test("with the reply in hand, a second ? leaves the first title", async () => {
    const outcome = await nameChat(
      { ...turn, reply: "Hello" },
      { generate: async () => "?", save: () => Promise.reject(new Error("unreachable")) },
      new AbortController().signal,
    );

    expect(outcome).toBe("unnamed");
  });
});
