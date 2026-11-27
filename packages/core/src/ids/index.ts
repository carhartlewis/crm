/**
 * Record ids: a registered prefix, `_`, then 24 random base62 characters, such as
 * `com_0123456789ABCDEFGHIJKLMN`. The prefix says what an id is at a glance (in a URL, a log
 * or a support message). Ids are opaque, case-sensitive and immutable; they grant no access.
 * Client-safe: the browser makes ids for optimistic rows with the same function as the server.
 *
 * Rows created before prefixes keep their lowercase UUIDs, and those still validate
 * (`isRecordId`), so existing links and memory namespaces never move. better-auth's tables keep
 * their own ids. Same scheme as comp-neo (`packages/db/src/ids.ts` there).
 */

/**
 * One prefix per table that holds records, keyed by its contract root (or the table it will
 * be). Never reuse a prefix: a dropped table's prefix stays here, marked retired.
 */
export const ID_PREFIXES = {
  company: "com",
  contact: "ctc",
  workflow: "wfk",
  connection: "cnx",
  custom_connector: "ccn",
  skill: "skl",
} as const;

/** Tables whose ids are not ours to make, and why. */
export const ID_EXEMPTIONS = {
  user: "managed by better-auth",
  session: "managed by better-auth",
  account: "managed by better-auth",
  verification: "managed by better-auth",
  workspace: "managed by better-auth (organization)",
  member: "managed by better-auth",
  invitation: "managed by better-auth",
  jwks: "managed by better-auth",
  oauthClient: "managed by better-auth",
  oauthResource: "managed by better-auth",
  oauthClientResource: "managed by better-auth",
  oauthRefreshToken: "managed by better-auth",
  oauthAccessToken: "managed by better-auth",
  oauthConsent: "managed by better-auth",
  oauthClientAssertion: "managed by better-auth",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

export const ID_BODY_LENGTH = 24;

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** The largest multiple of 62 below 256: bytes at or above it are dropped, so no bias. */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

const BODY = new RegExp(`^[0-9A-Za-z]{${ID_BODY_LENGTH}}$`);

const LEGACY_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

/** 24 base62 characters from a cryptographically secure source, each equally likely. */
function randomBody(random: (bytes: Uint8Array) => Uint8Array) {
  let body = "";

  while (body.length < ID_BODY_LENGTH) {
    for (const byte of random(new Uint8Array(ID_BODY_LENGTH - body.length))) {
      if (byte < UNBIASED_LIMIT) body += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }

  return body;
}

/** A new id, such as `com_0123456789ABCDEFGHIJKLMN`. `random` is injectable for tests. */
export function createId(
  prefix: IdPrefix,
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
) {
  return `${prefix}_${randomBody(random)}`;
}

/** Whether `value` is a prefixed id of this kind. */
export function isId(prefix: IdPrefix, value: string) {
  return value.startsWith(`${prefix}_`) && BODY.test(value.slice(prefix.length + 1));
}

/** A prefixed id of this kind, or a lowercase UUID from before prefixes. */
export function isRecordId(prefix: IdPrefix, value: string) {
  return isId(prefix, value) || LEGACY_UUID.test(value);
}
