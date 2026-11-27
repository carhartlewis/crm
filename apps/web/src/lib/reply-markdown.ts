/**
 * Tidies an agent reply before it renders, so a slip in the agent's formatting doesn't show:
 * a bulleted "Company — text" list becomes a table, a table that repeats companies already
 * shown as records goes, and a table's first-column company names become record links, so
 * every such row opens its company.
 */

export interface NamedRecord {
  readonly id: string;
  readonly name: string;
}

const RECORDS_FENCE = /```island-records\s*\n([\s\S]*?)\n```/g;
const IDS = /"ids"\s*:\s*\[([^\]]*)\]/;
const MENTION = /^:company\[([^\]]*)\]\{[^}]*\}$/;

const key = (name: string) => name.trim().toLowerCase();

/** The plain text of a table cell: no emphasis, no record mention, no padding. */
function cellName(cell: string) {
  const text = cell.trim().replaceAll(/\*\*|__/g, "");

  return MENTION.exec(text)?.[1] ?? text;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableLine = (line: string) => line.trim().startsWith("|");
const isSeparator = (line: string) => /^\|?\s*:?-{3,}/.test(line.trim());

/** The ids listed in the reply's `island-records` blocks. */
function shownIds(text: string) {
  const ids = new Set<string>();

  for (const match of text.matchAll(RECORDS_FENCE)) {
    const list = IDS.exec(match[1] ?? "")?.[1] ?? "";

    for (const id of list.matchAll(/"([^"]+)"/g)) if (id[1]) ids.add(id[1]);
  }

  return ids;
}

const LIST_ITEM = /^\s*[-*•]\s+(.+?)\s+[—–-]\s+(.+)$/;

/**
 * Runs of bullets where every item is "Company — text" for a known company become a
 * "Company | Summary" table (the agent is told to write tables; this catches the slips).
 */
function listsToTables(lines: readonly string[], byName: ReadonlyMap<string, NamedRecord>) {
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    let end = index;
    const rows: { company: NamedRecord; summary: string }[] = [];

    while (end < lines.length) {
      const match = LIST_ITEM.exec(lines[end] ?? "");
      const company = match ? byName.get(key(cellName(match[1] ?? ""))) : undefined;

      if (!match || !company) break;

      rows.push({ company, summary: (match[2] ?? "").replaceAll("|", "\\|") });
      end += 1;
    }

    // A list that only starts like this (one item, or more bullets after) stays a list.
    const next = lines[end] ?? "";

    if (rows.length >= 2 && !/^\s*[-*•]\s/.test(next)) {
      out.push("| Company | Summary |", "| --- | --- |");

      for (const row of rows) {
        out.push(`| :company[${row.company.name}]{record="${row.company.id}"} | ${row.summary} |`);
      }

      index = end;
      continue;
    }

    out.push(lines[index] ?? "");
    index += 1;
  }

  return out;
}

export function tidyReply(text: string, companies: readonly NamedRecord[]) {
  const byName = new Map(companies.map((company) => [key(company.name), company]));
  const shown = shownIds(text);

  const shownNames = new Set(
    companies.flatMap((company) => (shown.has(company.id) ? [key(company.name)] : [])),
  );

  const lines = listsToTables(text.split("\n"), byName);
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    // A table: a header row, a separator row, then body rows.
    if (!isTableLine(line) || !isSeparator(lines[index + 1] ?? "")) {
      out.push(line);
      index += 1;
      continue;
    }

    let end = index + 2;

    while (end < lines.length && isTableLine(lines[end] ?? "")) end += 1;

    const body = lines.slice(index + 2, end);
    const names = body.map((row) => key(cellName(cells(row)[0] ?? "")));
    const repeats = names.length > 0 && names.every((name) => shownNames.has(name));

    if (!repeats) {
      out.push(line, lines[index + 1] ?? "");

      for (const row of body) {
        const [first = "", ...rest] = cells(row);
        const company = MENTION.test(first.trim()) ? undefined : byName.get(key(cellName(first)));

        out.push(
          company
            ? `| :company[${company.name}]{record="${company.id}"} | ${rest.join(" | ")} |`
            : row,
        );
      }
    }

    index = end;
  }

  return out.join("\n");
}
