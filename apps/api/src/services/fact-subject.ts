import type { JevClient } from "@crm/memory/jev";

export interface NamedCompany {
  readonly id: string;
  readonly name: string;
}

/** How sure Jev must be that a fact is about one company before it is filed there. */
export const SUBJECT_THRESHOLD = 0.6;

/** At most this many companies are offered to Jev at once. */
const MAX_CANDIDATES = 25;

const WORKSPACE = "workspace";

const mentions = (text: string, name: string) =>
  name.trim().length > 1 && text.toLowerCase().includes(name.trim().toLowerCase());

/**
 * Which company a fact the agent saves is about, so news about Capgo lands on Capgo's memory,
 * not the workspace's. A fact naming exactly one company goes to it; otherwise Jev chooses among
 * the companies it names (or all of them, when it names none) and the workspace itself. When
 * unsure or unavailable, the fact stays with the workspace. Returns a company id, or null.
 */
export async function factSubject(
  text: string,
  companies: readonly NamedCompany[],
  jev: JevClient | null,
  signal: AbortSignal,
): Promise<string | null> {
  const named = companies.filter((company) => mentions(text, company.name));

  if (named.length === 1) return named[0]?.id ?? null;

  if (!jev || companies.length === 0) return null;

  const candidates = (named.length > 1 ? named : companies).slice(0, MAX_CANDIDATES);

  const result = await jev
    .decide(
      {
        state: { fact: text },
        questions: {
          subject: {
            type: "choice",
            instructions:
              "A CRM saves this fact to one company's memory, or to the workspace's own memory. Which company is the fact about?",
            criteria: {
              ...Object.fromEntries(
                candidates.map((company) => [company.id, `It is about ${company.name}.`]),
              ),
              [WORKSPACE]:
                "It is about the workspace's own business, about several companies at once, or about none of them.",
            },
          },
        },
      },
      signal,
    )
    .catch(() => null);

  const answer = result?.answers["subject"];

  if (answer?.type !== "choice" || answer.probability < SUBJECT_THRESHOLD) return null;

  return candidates.some((company) => company.id === answer.choice) ? answer.choice : null;
}
