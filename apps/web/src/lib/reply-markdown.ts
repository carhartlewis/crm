/**
 * Tidies an agent reply before it renders, so a slip in the agent's formatting doesn't show:
 * a bulleted "Company — text" list becomes a table, a table that repeats companies already
 * shown as records goes, and a table's first-column company names become record links, so
 * every such row opens its company. The first time the reply names a record this turn's tool
 * calls touched, the name becomes its mention. A record mention the agent wrapped in backticks, or wrote
 * after the same name in bold, becomes a bare mention so it renders as its chip.
 */

export interface NamedRecord {
  readonly id: string;
  readonly name: string;
}

/** A record this turn's tool calls touched (`turnRecords`), so the reply's name for it can open it. */
export interface MentionableRecord {
  readonly kind: "company" | "contact" | "deal";
  readonly id: string;
  readonly name: string | undefined;
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

const QUOTED_MENTION = /`(:(?:company|contact|deal)\[[^\]`\n]*\]\{record="[^"`\n]*"\})`/g;

const NAMED_MENTION =
  /(\*\*|__)([^*_\n]+)\1\s*\(\s*(:(?:company|contact|deal)\[([^\]\n]*)\]\{record="[^"\n]*"\})\s*\)/g;

/**
 * Mentions as the agent should have written them: never inside inline code (where they show as
 * source), and never after the same name in bold ("**Mercury** (:company[Mercury]{…})").
 */
function bareMentions(line: string) {
  return line
    .replaceAll(QUOTED_MENTION, "$1")
    .replaceAll(NAMED_MENTION, (whole, _mark, name: string, mention: string, label: string) =>
      key(name) === key(label) ? mention : whole,
    );
}

/** Applies `change` to every line outside code fences. */
function proseLines(lines: readonly string[], change: (line: string) => string) {
  let fenced = false;

  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;

      return line;
    }

    return fenced ? line : change(line);
  });
}

/** Text a name must never be linked inside: inline code, a mention, a link, a heading. */
const PROTECTED =
  /`[^`\n]*`|:(?:company|contact|deal)\[[^\]\n]*\]\{[^}\n]*\}|!?\[[^\]\n]*\]\([^)\n]*\)|^\s*#.*$/g;

const NO_RECORDS: readonly MentionableRecord[] = [];

const escapeRegExp = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A record's name alone, bold or not, never inside a longer word. */
const namePattern = (name: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(\\*\\*|__)?${escapeRegExp(name)}\\1(?![\\p{L}\\p{N}_])`, "iu");

/**
 * Replaces the first match of `pattern` in `line` outside protected spans, or returns null when
 * there is none.
 */
function replaceOutside(line: string, pattern: RegExp, replacement: string) {
  let start = 0;

  for (const span of [...line.matchAll(PROTECTED), null]) {
    const end = span ? (span.index ?? 0) : line.length;
    const match = pattern.exec(line.slice(start, end));

    if (match) {
      const at = start + match.index;

      return `${line.slice(0, at)}${replacement}${line.slice(at + match[0].length)}`;
    }

    if (span) start = end + span[0].length;
  }

  return null;
}

/**
 * The first time the reply names a record the turn touched, the name becomes its mention, so it
 * shows as a chip that opens it. Longer names go first ("Mercury — New opportunity" before
 * "Mercury"); a record already mentioned, and a name of under three letters, stay as they are.
 */
function linkNames(lines: readonly string[], records: readonly MentionableRecord[]) {
  const text = lines.join("\n");

  const named = records
    .flatMap((record) => {
      const name = record.name?.trim();

      return name && name.length >= 3 && !/[[\]\n|]/.test(name) && !text.includes(record.id)
        ? [{ ...record, name }]
        : [];
    })
    .toSorted((a, b) => b.name.length - a.name.length);

  let out = [...lines];

  for (const record of named) {
    const pattern = namePattern(record.name);
    const mention = `:${record.kind}[${record.name}]{record="${record.id}"}`;
    let done = false;

    out = proseLines(out, (line) => {
      if (done) return line;

      const changed = replaceOutside(line, pattern, mention);

      if (changed === null) return line;

      done = true;

      return changed;
    });
  }

  return out;
}

export function tidyReply(
  text: string,
  companies: readonly NamedRecord[],
  touched: readonly MentionableRecord[] = NO_RECORDS,
) {
  const byName = new Map(companies.map((company) => [key(company.name), company]));
  const shown = shownIds(text);

  const shownNames = new Set(
    companies.flatMap((company) => (shown.has(company.id) ? [key(company.name)] : [])),
  );

  const lines = linkNames(
    listsToTables(proseLines(text.split("\n"), bareMentions), byName),
    touched,
  );

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
