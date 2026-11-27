import { describe, expect, test } from "bun:test";
import { type JevAnswer, type JevClient, decide, jevQuestions, judge, noteText } from "./jev.ts";

const yes = (probability: number): JevAnswer => ({ type: "boolean", probability });

const pick = (choice: string, probability = 0.9): JevAnswer => ({
  type: "choice",
  choice,
  probability,
});

const answers = (overrides: Record<string, JevAnswer> = {}) => ({
  model: "test/jev",
  answers: {
    sensitive: yes(0.05),
    lasting: yes(0.9),
    subject: pick("c-acme"),
    known: yes(0.1),
    contradicts: pick("none"),
    ...overrides,
  },
});

describe("decide", () => {
  test("keeps a lasting, new fact about a company", () => {
    expect(decide(answers(), true)).toEqual({ action: "noted", subject: "c-acme" });
  });

  test("drops secrets, small talk, unknown subjects and facts already known", () => {
    expect(decide(answers({ sensitive: yes(0.6) }), true)).toMatchObject({ reason: "sensitive" });
    expect(decide(answers({ lasting: yes(0.4) }), true)).toMatchObject({ reason: "not_lasting" });
    expect(decide(answers({ subject: pick("none") }), true)).toMatchObject({
      reason: "no_subject",
    });
    expect(decide(answers({ subject: pick("c-acme", 0.3) }), true)).toMatchObject({
      reason: "no_subject",
    });
    expect(decide(answers({ known: yes(0.85) }), true)).toMatchObject({ reason: "known" });
  });

  test("replaces the fact it contradicts, before checking whether it is known", () => {
    expect(decide(answers({ contradicts: pick("f2", 0.8), known: yes(0.9) }), true)).toEqual({
      action: "replaced",
      subject: "c-acme",
      factId: "f2",
    });
    expect(decide(answers({ contradicts: pick("f2", 0.5) }), true)).toEqual({
      action: "noted",
      subject: "c-acme",
    });
  });

  test("asks about known facts only when there are some", async () => {
    expect(Object.keys(jevQuestions([], []))).toEqual(["sensitive", "lasting", "subject"]);

    const asked: string[][] = [];

    const client: JevClient = {
      decide: async (request) => {
        asked.push(Object.keys(request.questions));

        return answers();
      },
    };

    const candidate = {
      what: "chat_message" as const,
      who: "Alice",
      date: "2026-11-26T10:00:00Z",
      text: "Acme renews in March",
    };

    expect(
      await judge(client, { workspace: "Roadrunner", candidate, subjects: [], knownFacts: [] }),
    ).toEqual({ decision: { action: "noted", subject: "c-acme" }, model: "test/jev" });
    expect(asked[0]).not.toContain("known");
  });

  test("a model that skips a question fails loudly", () => {
    expect(() => decide({ model: "x", answers: { sensitive: yes(0) } }, false)).toThrow();
  });
});

test("the note quotes the member, dated", () => {
  expect(
    noteText({
      what: "sent_email",
      who: "Alice",
      date: "2026-11-26T10:00:00Z",
      text: " Price is $5k ",
    }),
  ).toBe('On 2026-11-26, Alice wrote in an email: "Price is $5k"');
});
