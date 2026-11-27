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
    ...input.socials.map((social) => `- ${social.type}: ${social.url}`),
    ...Object.entries(input.links).map(([kind, url]) => `- ${kind} page: ${url}`),
  ];

  const homepage = input.homepage?.trim().slice(0, MAX_HOMEPAGE_CHARACTERS) ?? "";

  // The name and domain alone are what we asked with, not something research found.
  if (found.length === 0 && !homepage) return null;

  const profile = [...line("Name", input.name), `- Website: ${input.domain}`, ...found];

  return [
    `# Website research for ${input.name ?? input.domain}`,
    "",
    `Public information from ${input.domain}, retrieved on ${retrievedAt.toISOString().slice(0, 10)}.`,
    "",
    "## Company profile",
    "",
    ...profile,
    "",
    ...(homepage ? ["## Home page", "", homepage] : []),
  ]
    .join("\n")
    .trim();
}
