/**
 * Tidies an agent reply before it renders, so a slip in the agent's formatting doesn't show:
 * a table that repeats companies already shown as records goes, and a table's first-column
 * company names become record links, so every such row opens its company.
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

export function tidyReply(text: string, companies: readonly NamedRecord[]) {
  const byName = new Map(companies.map((company) => [key(company.name), company]));
  const shown = shownIds(text);

  const shownNames = new Set(
    companies.flatMap((company) => (shown.has(company.id) ? [key(company.name)] : [])),
  );

  const lines = text.split("\n");
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
