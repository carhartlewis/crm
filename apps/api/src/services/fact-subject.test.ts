import { describe, expect, test } from "bun:test";
import type { JevClient } from "@crm/memory/jev";
import { factSubject } from "./fact-subject.ts";

const companies = [
  { id: "com_capgo", name: "Capgo" },
  { id: "com_docspring", name: "Docspring" },
];

const signal = new AbortController().signal;

const jevChoosing = (choice: string, probability: number): JevClient & { asked: number } => {
  const jev = {
    asked: 0,
    decide: async () => {
      jev.asked += 1;

      return {
        model: "fake",
        answers: { subject: { type: "choice" as const, choice, probability } },
      };
    },
  };

  return jev;
};

describe("which company a saved fact is about", () => {
  test("a fact naming one company goes to it without asking Jev", async () => {
    const jev = jevChoosing("workspace", 0.9);

    expect(await factSubject("Capgo hit $34K MRR", companies, jev, signal)).toBe("com_capgo");
    expect(jev.asked).toBe(0);
  });

  test("Jev chooses when the fact names none or several", async () => {
    const sure = jevChoosing("com_docspring", 0.8);
    const workspace = jevChoosing("workspace", 0.9);

    expect(await factSubject("Their MCP server shipped", companies, sure, signal)).toBe(
      "com_docspring",
    );
    expect(await factSubject("We raised our prices", companies, workspace, signal)).toBeNull();
  });

  test("unsure, unknown or no Jev: the fact stays with the workspace", async () => {
    expect(
      await factSubject("Shipped a thing", companies, jevChoosing("com_capgo", 0.4), signal),
    ).toBeNull();
    expect(
      await factSubject("Shipped a thing", companies, jevChoosing("com_other", 0.9), signal),
    ).toBeNull();
    expect(await factSubject("Shipped a thing", companies, null, signal)).toBeNull();
  });
});
