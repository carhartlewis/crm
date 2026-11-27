import { describe, expect, test } from "bun:test";
import {
  commandFor,
  matchCommands,
  parseSlash,
  skillCommandName,
  skillMessage,
  type SlashCommand,
  slashQuery,
} from "./slash-commands.ts";

const ran: string[] = [];

const command = (name: string, description: string): SlashCommand => ({
  name,
  description,
  run: (rest) => ran.push(`${name}:${rest}`),
});

const commands = [
  command("plan", "Research and propose a plan"),
  command("compact", "Summarize the conversation"),
  command("seo-audit", "Audit a site's search ranking"),
];

describe("slash commands", () => {
  test("a command and the text after it", () => {
    expect(parseSlash("/plan add Mercury\nand Ramp")).toEqual({
      name: "plan",
      rest: "add Mercury\nand Ramp",
    });
    expect(parseSlash("/Compact")).toEqual({ name: "compact", rest: "" });
    expect(parseSlash("plan this")).toBeNull();
    expect(parseSlash("/")).toBeNull();
  });

  test("the menu is open only while the name is typed", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/Pl")).toBe("pl");
    expect(slashQuery("/plan ")).toBeNull();
    expect(slashQuery("hello /plan")).toBeNull();
  });

  test("names that start with the query come first, then names, then descriptions", () => {
    expect(matchCommands("", commands)).toHaveLength(3);
    expect(matchCommands("a", commands).map((item) => item.name)).toEqual([
      "plan",
      "compact",
      "seo-audit",
    ]);
    expect(matchCommands("co", commands).map((item) => item.name)).toEqual(["compact"]);
    expect(matchCommands("c", commands).map((item) => item.name)).toEqual(["compact"]);
    expect(matchCommands("ranking", commands).map((item) => item.name)).toEqual(["seo-audit"]);
  });

  test("a sent message that names a command runs it; others are plain messages", () => {
    const found = commandFor("/plan add Mercury", commands);

    found?.command.run(found.rest);

    expect(ran).toEqual(["plan:add Mercury"]);
    expect(commandFor("/unknown thing", commands)).toBeNull();
    expect(commandFor("plan", commands)).toBeNull();
  });

  test("a workspace skill is a command named after it", () => {
    expect(skillCommandName("SEO Audit (v2)")).toBe("seo-audit-v2");
    expect(skillMessage("SEO Audit", "acme.com")).toBe('Use the "SEO Audit" skill: acme.com');
    expect(skillMessage("SEO Audit", "")).toBe('Use the "SEO Audit" skill.');
  });
});
