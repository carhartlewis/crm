import { describe, expect, test } from "bun:test";
import type { JevClient, JevResponse } from "@crm/memory/jev";
import { EMPTY_RECALL } from "@crm/memory/recall";
import type { CrmMemory } from "./crm-memory.ts";
import { chatId, crmMemoryProvider } from "./memory-provider.ts";
import type { TurnMessage } from "./turn-memory.ts";

function fakeMemory() {
  const calls: { method: string; input: unknown }[] = [];

  const memory: CrmMemory = {
    recall: async () => ({
      ...EMPTY_RECALL,
      workspace: { name: "Roadrunner", profile: [], relevant: [] },
    }),
    companies: async () => [{ id: "c-acme", name: "Acme", domain: "acme.test" }],
    search: async (input) => {
      calls.push({ method: "search", input });

      return input.companyId === "c-acme"
        ? [{ factId: "old-1", text: "Acme uses Salesforce", companyId: "c-acme" }]
        : [];
    },
    remember: async (input) => {
      calls.push({ method: "remember", input });
    },
    forget: async () => {},
    saveChat: async (input) => {
      calls.push({ method: "saveChat", input });
    },
  };

  return { memory, calls };
}

const jev = (answers: JevResponse["answers"]): JevClient => ({
  decide: async () => ({ model: "test", answers }),
});

const turnContext = (messages: TurnMessage[]) =>
  // SAFETY: `turn.completed` reads only the session id, the user, `messages` and `abortSignal`,
  // and this fake gives all four; the rest of eve's context is never touched.
  ({
    session: {
      id: "sess_1:abc",
      auth: {
        current: { principalType: "user", principalId: "alice", attributes: { name: "Alice" } },
      },
    },
    messages,
    abortSignal: new AbortController().signal,
  }) as never;

describe("capture", () => {
  test("saves the chat and replaces the fact a member's message makes out of date", async () => {
    const { memory, calls } = fakeMemory();

    const provider = crmMemoryProvider({
      memoryFor: () => memory,
      jev: jev({
        sensitive: { type: "boolean", probability: 0.01 },
        lasting: { type: "boolean", probability: 0.95 },
        subject: { type: "choice", choice: "c-acme", probability: 0.97 },
        known: { type: "boolean", probability: 0.1 },
        contradicts: { type: "choice", choice: "f1", probability: 0.9 },
      }),
      now: () => new Date("2026-11-26T10:00:00Z"),
      log: () => {},
    });

    await provider.capture?.["turn.completed"]?.(
      turnContext([{ role: "user", content: "Acme moved from Salesforce to HubSpot this month." }]),
    );

    expect(calls[0]).toEqual({
      method: "saveChat",
      input: {
        sessionId: "sess-1-abc",
        transcript: "Alice: Acme moved from Salesforce to HubSpot this month.",
      },
    });
    expect(calls.find((call) => call.method === "remember")?.input).toEqual({
      kind: "agent_fact",
      text: 'On 2026-11-26, Alice said in a CRM chat: "Acme moved from Salesforce to HubSpot this month."',
      replaces: "old-1",
      companyId: "c-acme",
    });
  });

  test("keeps nothing Jev calls passing, and still saves the chat without Jev", async () => {
    const { memory, calls } = fakeMemory();

    const passing = crmMemoryProvider({
      memoryFor: () => memory,
      jev: jev({
        sensitive: { type: "boolean", probability: 0.01 },
        lasting: { type: "boolean", probability: 0.2 },
        subject: { type: "choice", choice: "workspace", probability: 0.9 },
        known: { type: "boolean", probability: 0 },
        contradicts: { type: "choice", choice: "none", probability: 0.9 },
      }),
      log: () => {},
    });

    await passing.capture?.["turn.completed"]?.(
      turnContext([{ role: "user", content: "What do we know about Acme these days?" }]),
    );

    expect(calls.some((call) => call.method === "remember")).toBe(false);

    const { memory: other, calls: otherCalls } = fakeMemory();
    const off = crmMemoryProvider({ memoryFor: () => other, jev: null, log: () => {} });

    await off.capture?.["turn.completed"]?.(
      turnContext([{ role: "user", content: "Acme moved from Salesforce to HubSpot." }]),
    );

    expect(otherCalls.map((call) => call.method)).toEqual(["saveChat"]);
  });
});

test("chat ids keep only letters, digits and hyphens", () => {
  expect(chatId("ses_01:ab/c")).toBe("ses-01-ab-c");
});
