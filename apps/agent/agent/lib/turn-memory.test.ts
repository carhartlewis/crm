import { describe, expect, test } from "bun:test";
import {
  candidatesOf,
  isSendEmailTool,
  latestTurn,
  sentEmails,
  transcriptOf,
  type TurnMessage,
} from "./turn-memory.ts";

/** A send tool's input, as Gmail and similar apps shape it. */
type EmailInput = { to: string | string[]; subject: string; body?: string; html?: string };

const send = (
  id: string,
  input: EmailInput,
  tool = "connections__gmail__send_message",
): TurnMessage => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: id, toolName: tool, input }],
});

const result = (
  id: string,
  type = "json",
  tool = "connections__gmail__send_message",
): TurnMessage => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: id, toolName: tool, output: { type, value: {} } }],
});

const history: TurnMessage[] = [
  { role: "user", content: "Hi there" },
  { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
  { role: "user", content: "Acme switched their CRM to HubSpot last week, email Bob" },
  send("t1", { to: ["Bob@Acme.test"], subject: "Pricing", body: "Our price is $5k a year." }),
  result("t1"),
  send("t2", { to: "eve@beta.test", subject: "Hi", html: "<p>Denied</p>" }),
  result("t2", "execution-denied"),
  { role: "assistant", content: [{ type: "text", text: "Sent." }] },
];

describe("sent emails", () => {
  test("only the sends that succeeded, with lowercased recipients and text bodies", () => {
    expect(sentEmails(history)).toEqual([
      { to: ["bob@acme.test"], subject: "Pricing", body: "Our price is $5k a year." },
    ]);
  });

  test("recognise send tools, not drafts or reads", () => {
    expect(isSendEmailTool("connections__gmail__reply")).toBe(true);
    expect(isSendEmailTool("connections__superhuman__send_email")).toBe(true);
    expect(isSendEmailTool("connections__gmail__create_draft")).toBe(false);
    expect(isSendEmailTool("connections__gmail__search_threads")).toBe(false);
  });
});

describe("a turn", () => {
  test("starts at the member's latest message", () => {
    expect(latestTurn(history)[0]).toEqual(history[2]);
  });

  test("gives Jev the member's message and the sent email, not small talk", () => {
    const candidates = candidatesOf(latestTurn(history), "Alice", new Date("2026-11-26T10:00:00Z"));

    expect(candidates.map((entry) => entry.candidate.what)).toEqual(["chat_message", "sent_email"]);
    expect(candidates[1]?.recipients).toEqual(["bob@acme.test"]);
    expect(candidates[1]?.candidate.text).toBe("Subject: Pricing\nOur price is $5k a year.");
    expect(candidatesOf([{ role: "user", content: "ok thanks" }], "Alice", new Date())).toEqual([]);
  });

  test("reads as a transcript with the emails that went out", () => {
    const text = transcriptOf(history, "Alice");

    expect(text).toContain("Alice: Hi there");
    expect(text).toContain("Assistant: Hello!");
    expect(text).toContain("[Email to bob@acme.test: Pricing]\nOur price is $5k a year.");
    expect(text).not.toContain("Denied");
  });
});
