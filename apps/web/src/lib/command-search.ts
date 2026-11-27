import uFuzzy from "@leeoniya/ufuzzy";

/**
 * Ranking for ⌘K, in tiers: the exact label, then labels that start with the query, then labels
 * where every typed word starts a word, then labels that contain every typed word, then labels
 * one typo away (at a word start), then items found only through their section or keywords.
 * Words may come in any order. Within a label tier, uFuzzy's order (denser, earlier matches
 * first); keyword matches keep their listed order.
 *
 * uFuzzy matches each typed word inside one word of the label, so "mem" finds "Memory" but
 * never the scattered letters of "theme system", the way cmdk's built-in scorer does.
 */
export interface Searchable {
  readonly label: string;
  /** The heading the item sits under, such as "Workspace settings". Searched, not highlighted. */
  readonly section: string;
  readonly keywords?: readonly string[];
}

export interface Ranked<T> {
  readonly item: T;
  /** Matched [start, end) offsets in the label, flat; null when only keywords matched. */
  readonly ranges: readonly number[] | null;
}

const Tier = {
  exact: 0,
  prefix: 1,
  wordStarts: 2,
  substring: 3,
  typo: 4,
  keywords: 5,
} as const;

/** Up to this many typed words are tried in every order. 3 words is 6 orders. */
const OUT_OF_ORDER = 3;

/** Every typed word as a substring, in any order. */
const exact = new uFuzzy({});

/** One typo per word of four letters or more, and the word must start a word of the label. */
const typo = new uFuzzy({
  // IntraMode.SingleError and BoundMode.Loose: const enums, so their values are written out.
  intraMode: 1,
  interLft: 1,
  intraRules: (term) => {
    const typos = term.length >= 4 ? 1 : 0;

    // The first letter must match; one typo in "me" would match almost anything.
    return {
      intraSlice: [1, Infinity],
      intraIns: typos,
      intraSub: typos,
      intraTrn: typos,
      intraDel: typos,
    };
  },
});

interface Hit {
  readonly idx: number;
  readonly ranges: readonly number[] | null;
}

/** Haystack indexes in uFuzzy's ranked order, with highlight ranges when it has them. */
function search(fuzzy: uFuzzy, haystack: readonly string[], needle: string): readonly Hit[] {
  const [idxs, info, order] = fuzzy.search([...haystack], needle, OUT_OF_ORDER);

  if (!idxs) return [];

  // Without info (over uFuzzy's ranking threshold, far beyond ⌘K's size) keep haystack order.
  if (!info || !order) return idxs.map((idx) => ({ idx, ranges: null }));

  return order.map((at) => ({ idx: info.idx[at] ?? 0, ranges: info.ranges[at] ?? null }));
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Where each word of `label` starts: after a non-letter or digit, or at a lower-to-upper step. */
function wordStarts(label: string) {
  const starts: number[] = [];

  for (let index = 0; index < label.length; index += 1) {
    const char = label[index] ?? "";
    const previous = label[index - 1] ?? " ";
    const camel = /\p{Ll}/u.test(previous) && /\p{Lu}/u.test(char);

    if (WORD_CHAR.test(char) && (!WORD_CHAR.test(previous) || camel)) starts.push(index);
  }

  return starts;
}

/**
 * The ranges when every typed word starts a different word of the label (in any order), or
 * null. Each typed word takes the first free word it starts.
 */
function wordStartRanges(label: string, terms: readonly string[]) {
  const lower = label.toLowerCase();
  const free = wordStarts(label);
  const ranges: [number, number][] = [];

  for (const term of terms) {
    const at = free.findIndex((start) => lower.startsWith(term, start));
    const start = free[at];

    if (start === undefined) return null;

    free.splice(at, 1);
    ranges.push([start, start + term.length]);
  }

  return ranges.toSorted((a, b) => a[0] - b[0]).flat();
}

/** The tier of a label that contains every typed word, with the ranges to highlight. */
function exactTier(label: string, needle: string, terms: readonly string[], hit: Hit) {
  const lower = label.toLowerCase();

  if (lower === needle) return { tier: Tier.exact, ranges: [0, label.length] };

  if (lower.startsWith(needle)) return { tier: Tier.prefix, ranges: [0, needle.length] };

  const starts = wordStartRanges(label, terms);

  return starts
    ? { tier: Tier.wordStarts, ranges: starts }
    : { tier: Tier.substring, ranges: hit.ranges };
}

export function rankCommands<T extends Searchable>(
  items: readonly T[],
  query: string,
): readonly Ranked<T>[] {
  const needle = query.trim().toLowerCase();

  if (needle === "") return items.map((item) => ({ item, ranges: null }));

  const terms = needle.split(/\s+/);
  const labels = items.map((item) => item.label);
  const ranked: { tier: number; idx: number; ranges: readonly number[] | null }[] = [];
  const found = new Set<number>();

  const add = (tier: number, idx: number, ranges: readonly number[] | null) => {
    if (found.has(idx)) return;

    found.add(idx);
    ranked.push({ tier, idx, ranges });
  };

  for (const hit of search(exact, labels, needle)) {
    const { tier, ranges } = exactTier(labels[hit.idx] ?? "", needle, terms, hit);

    add(tier, hit.idx, ranges);
  }

  for (const hit of search(typo, labels, needle)) add(Tier.typo, hit.idx, hit.ranges);

  const context = items.map((item) => [item.section, ...(item.keywords ?? [])].join(" "));

  // In listed order, so a section's items stay together.
  const byContext = search(exact, context, needle).map((hit) => hit.idx);

  for (const idx of byContext.toSorted((a, b) => a - b)) add(Tier.keywords, idx, null);

  // The sort is stable: within a tier, uFuzzy's order stays.
  return ranked
    .toSorted((a, b) => a.tier - b.tier)
    .flatMap(({ idx, ranges }) => {
      const item = items[idx];

      return item ? [{ item, ranges }] : [];
    });
}
