/**
 * Website research as a memory source: context.dev's brand profile plus the home page as
 * Markdown. Supermemory extracts the facts; this only lays out the evidence with its origin.
 */

export interface ResearchInput {
  readonly domain: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly slogan: string | null;
  readonly industries: readonly string[];
  readonly address: string | null;
  readonly socials: readonly { readonly type: string; readonly url: string }[];
  readonly links: Readonly<Record<string, string>>;
  readonly email: string | null;
  readonly phone: string | null;
  readonly stock: string | null;
  /** The home page as Markdown, already trimmed. */
  readonly homepage: string | null;
}

/** Keeps a page to a size Supermemory extracts well and that never floods a namespace. */
export const MAX_HOMEPAGE_CHARACTERS = 12_000;

function line(label: string, value: string | null | undefined) {
  return value ? [`- ${label}: ${value}`] : [];
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A line of page chrome: a step number or rating ("01", "4.9/5"), or a button ("Book Demo"). */
function isChrome(text: string) {
  const trimmed = text.trim();

  if (!trimmed || /^(#|[-*+]\s|\d+\.\s|>|\|)/.test(trimmed)) return false;

  if (!/\p{L}/u.test(trimmed)) return true;

  return trimmed.split(/\s+/).length <= 3 && !/[.!?:\]]/.test(trimmed);
}

/** Drops page chrome outside code, so the page reads as text and yields no junk facts. */
function dropChrome(markdown: string) {
  let fenced = false;

  return markdown
    .split("\n")
    .filter((text) => {
      if (/^\s*(```|~~~)/.test(text)) {
        fenced = !fenced;

        return true;
      }

      return fenced || !isChrome(text);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Moves the page's own headings two levels down, so they sit under "Home page". */
function nestHeadings(markdown: string) {
  let fenced = false;

  return markdown
    .split("\n")
    .map((text) => {
      if (/^\s*(```|~~~)/.test(text)) fenced = !fenced;

      if (fenced) return text;

      return text.replace(/^(#{1,6})(?=\s)/, (marks) => "#".repeat(Math.min(marks.length + 2, 6)));
    })
    .join("\n");
}

/** The source text, or null when the research found nothing to remember. */
export function researchText(input: ResearchInput, retrievedAt: Date): string | null {
  const found = [
    ...line("Description", input.description),
    ...line("Tagline", input.slogan),
    ...line("Industry", input.industries.join("; ") || null),
    ...line("Headquarters", input.address),
    ...line("Public email", input.email),
    ...line("Public phone", input.phone),
    ...line("Stock", input.stock),
    ...input.socials.flatMap((social) => line(capitalize(social.type), social.url)),
    ...Object.entries(input.links).flatMap(([kind, url]) => line(`${capitalize(kind)} page`, url)),
  ];

  const homepage = dropChrome(input.homepage ?? "")
    .trim()
    .slice(0, MAX_HOMEPAGE_CHARACTERS);

  // The name and domain alone are what we asked with, not something research found.
  if (found.length === 0 && !homepage) return null;

  const profile = [...line("Name", input.name), ...line("Website", input.domain), ...found];

  return [
    `# Website research for ${input.name ?? input.domain}`,
    "",
    `Public information from ${input.domain}, retrieved on ${retrievedAt.toISOString().slice(0, 10)}.`,
    "",
    "## Company profile",
    "",
    ...profile,
    "",
    ...(homepage ? ["## Home page", "", nestHeadings(homepage)] : []),
  ]
    .join("\n")
    .trim();
}
