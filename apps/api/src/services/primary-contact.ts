import type { RecordRow, RecordTx } from "./record-store.ts";

/** A row's timestamp in milliseconds, or 0 when it has none. */
const time = (row: RecordRow, field: string) => {
  const value = row[field];

  return value instanceof Date ? value.getTime() : 0;
};

/**
 * The contact to make primary in place of `leavingId`: the company's most recently active
 * remaining contact that isn't archived (then the newest), or `null` when none is left.
 */
export function nextPrimary(contacts: readonly RecordRow[], leavingId: string) {
  const candidates = contacts.filter(
    (row) =>
      row["id"] !== leavingId && (row["archivedAt"] === null || row["archivedAt"] === undefined),
  );

  const [best] = candidates.toSorted(
    (a, b) =>
      time(b, "lastActivityAt") - time(a, "lastActivityAt") ||
      time(b, "createdAt") - time(a, "createdAt"),
  );

  return best ? String(best["id"]) : null;
}

/** Makes `contactId` the company's primary contact when it has none. */
async function claim(tx: RecordTx, workspaceId: string, companyId: string, contactId: string) {
  const company = await tx.get("company", workspaceId, companyId);

  if (company && !company["primaryContactId"]) {
    await tx.update("company", workspaceId, companyId, { primaryContactId: contactId });
  }
}

/** When `leavingId` is the company's primary contact, hands the role on (or clears it). */
async function release(tx: RecordTx, workspaceId: string, companyId: string, leavingId: string) {
  const company = await tx.get("company", workspaceId, companyId);

  if (company?.["primaryContactId"] !== leavingId) return;

  const next = nextPrimary(await tx.contactsAt(workspaceId, companyId), leavingId);

  await tx.update("company", workspaceId, companyId, { primaryContactId: next });
}

/**
 * Keeps companies' primary contacts right after a contact is written, in the same transaction.
 * `before` and `after` are the contact's company before and after the write (`after` is `null`
 * when the contact was deleted), and `active` is false once it is archived or deleted.
 *
 * A contact that arrives at a company without a primary contact (created there, moved there or
 * restored) becomes it. A primary contact that leaves (moved away, archived or deleted) hands it
 * to the most recently active remaining contact. The old company is released before the new one
 * is claimed: a contact is the primary of one company at most.
 */
export async function keepPrimaryContact(
  tx: RecordTx,
  workspaceId: string,
  change: {
    readonly contactId: string;
    readonly before: string | null;
    readonly after: string | null;
    readonly active: boolean;
  },
) {
  const { contactId, before, after, active } = change;

  if (before && (before !== after || !active)) {
    await release(tx, workspaceId, before, contactId);
  }

  if (after && active) await claim(tx, workspaceId, after, contactId);
}
