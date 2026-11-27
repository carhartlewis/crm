import { describe, expect, test } from "bun:test";
import { tidyReply } from "./reply-markdown.ts";

const companies = [
  { id: "com_a", name: "Capgo" },
  { id: "com_b", name: "Docspring" },
];

const records = '```island-records\n{"id":"all","kind":"company","ids":["com_a","com_b"]}\n```';

const table =
  "| Company | Domain |\n| --- | --- |\n| Capgo | capgo.app |\n| **Docspring** | docspring.com |";

describe("tidyReply", () => {
  test("a table that repeats companies shown as records goes", () => {
    expect(tidyReply(`You have 2:\n\n${records}\n\n${table}\n\nDone.`, companies)).toBe(
      `You have 2:\n\n${records}\n\n\nDone.`,
    );
  });

  test("a table's first-column company names open their records", () => {
    expect(tidyReply(table, companies)).toBe(
      "| Company | Domain |\n| --- | --- |\n" +
        '| :company[Capgo]{record="com_a"} | capgo.app |\n' +
        '| :company[Docspring]{record="com_b"} | docspring.com |',
    );
  });

  test("a table with other companies or other rows stays", () => {
    const mixed = "| Company | Domain |\n| --- | --- |\n| Capgo | capgo.app |\n| Acme | acme.com |";
    const onlyCapgo = '```island-records\n{"id":"one","kind":"company","ids":["com_a"]}\n```';

    expect(tidyReply(`${onlyCapgo}\n${mixed}`, companies)).toContain("| Acme | acme.com |");
  });

  test("a mention in backticks, or after the same name in bold, becomes a bare mention", () => {
    const deal = ':deal[Mercury — New opportunity]{record="del_a"}';

    expect(tidyReply(`Created **Mercury — New opportunity** (\`${deal}\`).`, companies)).toBe(
      `Created ${deal}.`,
    );
    expect(tidyReply(`See \`${deal}\` and **Acme** (${deal}).`, companies)).toBe(
      `See ${deal} and **Acme** (${deal}).`,
    );
    expect(tidyReply(`\`\`\`md\n\`${deal}\`\n\`\`\``, companies)).toBe(
      `\`\`\`md\n\`${deal}\`\n\`\`\``,
    );
  });

  test("the first name of a record the turn touched becomes its mention", () => {
    const touched = [
      { kind: "deal" as const, id: "del_a", name: "Mercury — New opportunity" },
      { kind: "company" as const, id: "com_m", name: "Mercury" },
    ];

    expect(
      tidyReply(
        "Created **Mercury — New opportunity** against Mercury. Mercury had no other deals.",
        companies,
        touched,
      ),
    ).toBe(
      'Created :deal[Mercury — New opportunity]{record="del_a"} against :company[Mercury]{record="com_m"}. Mercury had no other deals.',
    );
  });

  test("a touched name inside code, a link, a word or a fence, or one already mentioned, stays", () => {
    const touched = [{ kind: "company" as const, id: "com_m", name: "Mercury" }];

    for (const text of [
      "Run `Mercury` now.",
      "See [Mercury](https://mercury.com).",
      "Mercurylike banks.",
      "```\nMercury\n```",
      ':company[Mercury Bank]{record="com_m"} and Mercury.',
    ]) {
      expect(tidyReply(text, companies, touched)).toBe(text);
    }
  });

  test("text without tables is untouched", () => {
    expect(tidyReply("Just a sentence.", companies)).toBe("Just a sentence.");
  });

  test("a bulleted list of companies with a line each becomes a table that opens them", () => {
    const list = [
      "News, one line each:",
      "",
      '- :company[Capgo]{record="com_a"} — shipped Cloud Build.',
      "- **Docspring** – released an MCP server.",
    ].join("\n");

    expect(tidyReply(list, companies)).toBe(
      [
        "News, one line each:",
        "",
        "| Company | Summary |",
        "| --- | --- |",
        '| :company[Capgo]{record="com_a"} | shipped Cloud Build. |',
        '| :company[Docspring]{record="com_b"} | released an MCP server. |',
      ].join("\n"),
    );
  });

  test("a list that isn't one line per known company stays a list", () => {
    const steps = "- Open Capgo — check the domain.\n- Then save.";

    expect(tidyReply(steps, companies)).toBe(steps);
  });
});
