import type { MemorySubject } from "./types.ts";

const NAMESPACE = /^[a-zA-Z0-9_:-]{1,100}$/;

const PREFIX = /^[a-z0-9]{1,16}$/;

/** A workspace or record id: letters, digits, `-` (UUIDs) and `_` (prefixed ids, `com_…`). */
const ID = /^[a-zA-Z0-9_-]{1,40}$/;

/** A record's namespace tag and id. Company namespaces predate the others. */
function recordPart(subject: Exclude<MemorySubject, { type: "workspace" }>): [string, string] {
  switch (subject.type) {
    case "company":
      return ["co", subject.companyId];
    case "contact":
      return ["ct", subject.contactId];
    case "deal":
      return ["dl", subject.dealId];
  }
}

/**
 * The store namespace for a subject. The prefix keeps environments that share one Supermemory
 * account apart (see `memoryPrefix`); the workspace id keeps tenants apart, and every company,
 * contact and deal namespace sits under its workspace's.
 */
export function memoryNamespace(prefix: string, workspaceId: string, subject: MemorySubject) {
  if (!PREFIX.test(prefix)) {
    throw new Error("The memory prefix must be 1 to 16 lowercase letters or digits.");
  }

  if (!ID.test(workspaceId)) throw new Error("The workspace id can't name a memory.");

  const base = `${prefix}_ws_${workspaceId}`;

  if (subject.type === "workspace") return base;

  const [tag, id] = recordPart(subject);

  if (!ID.test(id)) throw new Error(`The ${subject.type} id can't name a memory.`);

  const namespace = `${base}_${tag}_${id}`;

  if (!NAMESPACE.test(namespace)) throw new Error("The memory namespace is too long.");

  return namespace;
}

/** A short, stable prefix for one deployment, such as its public origin. */
export async function memoryPrefix(deployment: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deployment));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0"));

  return `crm${hex.join("").slice(0, 12)}`;
}
