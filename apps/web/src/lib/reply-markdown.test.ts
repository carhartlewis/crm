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

  test("text without tables is untouched", () => {
    expect(tidyReply("Just a sentence.", companies)).toBe("Just a sentence.");
  });
});
