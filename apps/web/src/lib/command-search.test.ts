import { describe, expect, test } from "bun:test";
import { rankCommands, type Searchable } from "./command-search.ts";

const commands: readonly Searchable[] = [
  { label: "Home", section: "Go to" },
  {
    label: "Workflows",
    section: "Go to",
    keywords: ["Automations that run when something in your CRM changes."],
  },
  { label: "Companies", section: "Go to" },
  { label: "General", section: "Workspace settings" },
  { label: "Workspace Memory", section: "Workspace settings" },
  { label: "Workspace Skills", section: "Workspace settings" },
  { label: "Connections", section: "Account settings" },
  { label: "Use system theme", section: "Actions" },
  { label: "Use light theme", section: "Actions" },
];

const labels = (query: string) => rankCommands(commands, query).map(({ item }) => item.label);

describe("rankCommands", () => {
  test("without a query, keeps every item in its order", () => {
    expect(labels("  ")).toEqual(commands.map((command) => command.label));
  });

  test("matches letters inside one word, never scattered across words", () => {
    // "mem" is in no word of "Home", "Workflows" or "Use system theme".
    expect(labels("mem")).toEqual(["Workspace Memory"]);
  });

  test("ranks exact, then prefix, then word starts, then the middle of a word", () => {
    expect(labels("home")).toEqual(["Home"]);
    expect(labels("co")).toEqual(["Companies", "Connections"]);
    // "Skills" and "system" start with s; the others only contain it.
    expect(new Set(labels("s").slice(0, 2))).toEqual(
      new Set(["Workspace Skills", "Use system theme"]),
    );
    expect(labels("flows")).toEqual(["Workflows"]);
  });

  test("forgives one typo in a longer word, but not in a short one", () => {
    expect(labels("memroy")).toEqual(["Workspace Memory"]);
    expect(labels("hoem")).toEqual(["Home"]);
    expect(labels("mme")).toEqual([]);
  });

  test("matches words in any order", () => {
    expect(labels("skills workspace")).toEqual(["Workspace Skills"]);
  });

  test("finds items by section and keywords after the label matches", () => {
    expect(labels("account")).toEqual(["Connections"]);
    expect(labels("automations")).toEqual(["Workflows"]);
    expect(labels("settings")).toEqual([
      "General",
      "Workspace Memory",
      "Workspace Skills",
      "Connections",
    ]);
  });

  test("highlights what matched in the label only", () => {
    const [memory] = rankCommands(commands, "mem");
    const [workflows] = rankCommands(commands, "automations");

    expect(memory?.ranges).toEqual([10, 13]);
    // Each typed word is marked where it starts a word, not where it first appears.
    expect(rankCommands(commands, "sk wo")[0]?.ranges).toEqual([0, 2, 10, 12]);
    expect(workflows?.ranges).toBeNull();
  });
});
