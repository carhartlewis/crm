/**
 * Duplicate people. The API refuses or merges a new contact that is already in the workspace,
 * and the web app uses the same rules to show "In CRM" before anyone adds them. Client-safe.
 */

/** What identifies a person, in the API's field names. */
export interface PersonIdentity {
  readonly firstName: string;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly linkedinUrl: string | null;
  readonly companyId: string | null;
}

/** Why two rows are the same person, strongest first. */
export type DuplicateReason = "linkedin" | "email" | "name";

export interface Duplicate<T> {
  readonly contact: T;
  readonly reason: DuplicateReason;
}

/**
 * A LinkedIn profile's handle, lower case and decoded: `ben-tossell-70453537` for
 * `https://uk.linkedin.com/in/Ben-Tossell-70453537/?trk=x`. Null for anything else.
 */
export function linkedinHandle(url: string | null | undefined) {
  const raw = url ? /linkedin\.com\/in\/([^/?#\s]+)/i.exec(url)?.[1] : undefined;

  if (!raw) return null;

  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** An email compared without case or spaces. */
export function emailKey(email: string | null | undefined) {
  const key = email?.trim().toLowerCase();

  return key?.includes("@") ? key : null;
}

/** A name without case, accents, punctuation or extra spaces: `José O'Neil` → `jose oneil`. */
export function nameKey(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/['’.]/g, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Common short forms that are not a prefix of the full name. */
const NICKNAMES = new Map(
  Object.entries({
    bob: "robert",
    bobby: "robert",
    rob: "robert",
    robbie: "robert",
    bill: "william",
    billy: "william",
    will: "william",
    jim: "james",
    jimmy: "james",
    jamie: "james",
    dave: "david",
    jack: "john",
    johnny: "john",
    dick: "richard",
    rick: "richard",
    ricky: "richard",
    rich: "richard",
    tony: "anthony",
    ted: "edward",
    ed: "edward",
    eddie: "edward",
    chuck: "charles",
    charlie: "charles",
    liz: "elizabeth",
    beth: "elizabeth",
    betty: "elizabeth",
    kate: "katherine",
    katie: "katherine",
    cathy: "catherine",
    peggy: "margaret",
    maggie: "margaret",
    meg: "margaret",
    becky: "rebecca",
  }),
);

/** A first name in one form: its first word, with a known nickname spelled out. */
function firstKey(first: string) {
  const word = nameKey(first).split(" ")[0] ?? "";

  return NICKNAMES.get(word) ?? word;
}

/**
 * Whether two first names can be one person: the same, a known nickname (Bob, Robert), or one
 * the start of the other with at least three letters (Ben, Benjamin; Chris, Christopher).
 */
export function sameFirstName(a: string, b: string) {
  const left = firstKey(a);
  const right = firstKey(b);

  if (!left || !right) return false;

  if (left === right) return true;

  const [short, long] = left.length <= right.length ? [left, right] : [right, left];

  return short.length >= 3 && long.startsWith(short);
}

/** Two different LinkedIn profiles: proof of two people, whatever their names. */
function differentProfiles(a: PersonIdentity, b: PersonIdentity) {
  const left = linkedinHandle(a.linkedinUrl);
  const right = linkedinHandle(b.linkedinUrl);

  return left !== null && right !== null && left !== right;
}

/** Why `existing` is the person `candidate` describes, or null when they are two people. */
export function duplicateReason(
  candidate: PersonIdentity,
  existing: PersonIdentity,
): DuplicateReason | null {
  const handle = linkedinHandle(candidate.linkedinUrl);

  if (handle && handle === linkedinHandle(existing.linkedinUrl)) return "linkedin";

  if (differentProfiles(candidate, existing)) return null;

  const email = emailKey(candidate.email);

  if (email && email === emailKey(existing.email)) return "email";

  // A name alone matches only at the same company, and only with a last name on both sides.
  const last = nameKey(candidate.lastName);

  if (
    candidate.companyId &&
    candidate.companyId === existing.companyId &&
    last &&
    last === nameKey(existing.lastName) &&
    sameFirstName(candidate.firstName, existing.firstName)
  ) {
    return "name";
  }

  return null;
}

const STRENGTH: Record<DuplicateReason, number> = { linkedin: 0, email: 1, name: 2 };

/**
 * The contact `candidate` already is, or null. The strongest reason wins, and a live contact
 * wins over an archived one with the same reason.
 */
export function findDuplicate<T>(
  candidate: PersonIdentity,
  contacts: Iterable<T>,
  identity: (contact: T) => PersonIdentity & { readonly archived: boolean },
): Duplicate<T> | null {
  let best: { contact: T; reason: DuplicateReason; rank: number } | null = null;

  for (const contact of contacts) {
    const person = identity(contact);
    const reason = duplicateReason(candidate, person);

    if (!reason) continue;

    const rank = STRENGTH[reason] * 2 + (person.archived ? 1 : 0);

    if (!best || rank < best.rank) best = { contact, reason, rank };
  }

  return best ? { contact: best.contact, reason: best.reason } : null;
}

/** How the reason reads to a member: "Ben Tossell is already in the CRM (same email)." */
export function duplicateMessage(name: string, reason: DuplicateReason, archived: boolean) {
  const why = { linkedin: "same LinkedIn", email: "same email", name: "same name and company" }[
    reason
  ];

  return archived
    ? `${name} is already in the CRM but archived (${why}). Restore them instead.`
    : `${name} is already in the CRM (${why}).`;
}
