import type { Db } from "@crm/core/db";
import type { VisitRow } from "@crm/core/tracking";

/** A visit to store: the visit's columns plus the record it was matched to, if any. */
export interface NewVisit {
  readonly id: string;
  readonly workspaceId: string;
  readonly visitorId: string;
  readonly companyId: string | null;
  readonly contactId: string | null;
  readonly path: string;
  readonly referrer: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly occurredAt: Date;
}

/** Who a visitor turned out to be. */
export interface VisitorMatch {
  readonly contactId: string | null;
  readonly companyId: string | null;
}

/** The match columns an identify call sets; one left out keeps its old value. */
interface VisitMatchPatch {
  contactId?: string;
  companyId?: string;
}

/** Whose visits to read. */
export type VisitTarget = { readonly companyId: string } | { readonly contactId: string };

/** The rows website tracking reads and writes. Every call is scoped by workspace. */
export interface TrackingStore {
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  trackingKey(workspaceId: string): Promise<string | null>;
  /** Sets or clears the key; touches only `tracking_key` of the workspace's settings row. */
  setTrackingKey(workspaceId: string, key: string | null): Promise<void>;
  workspaceForKey(key: string): Promise<string | null>;
  recordExists(table: "company" | "contact", workspaceId: string, id: string): Promise<boolean>;
  /** The contact with this (lowercase) email, preferring one that isn't archived. */
  contactByEmail(
    workspaceId: string,
    email: string,
  ): Promise<{ id: string; companyId: string | null } | null>;
  companyByDomain(workspaceId: string, domain: string): Promise<string | null>;
  /** Who this visitor's latest visit was matched to, or `null`. */
  visitorMatch(workspaceId: string, visitorId: string): Promise<VisitorMatch | null>;
  /** Matches every visit of this visitor to the contact and company; a `null` keeps the old. */
  matchVisitor(workspaceId: string, visitorId: string, match: VisitorMatch): Promise<void>;
  insertVisit(visit: NewVisit): Promise<void>;
  visits(workspaceId: string, target: VisitTarget): Promise<readonly VisitRow[]>;
}

/** A record's visits read for its rollup: plenty for counts, bounded per request. */
export const MAX_ROLLUP_VISITS = 20_000;

export function prismaTrackingStore(db: Db): TrackingStore {
  const orm = db.orm.public;

  return {
    isMember: async (workspaceId, userId) =>
      (await orm.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    trackingKey: async (workspaceId) =>
      (await orm.WorkspaceSetting.where({ workspaceId }).first())?.trackingKey ?? null,
    setTrackingKey: async (workspaceId, key) => {
      const now = new Date();

      await orm.WorkspaceSetting.upsert({
        create: { workspaceId, trackingKey: key, updatedAt: now },
        update: { trackingKey: key, updatedAt: now },
      });
    },
    workspaceForKey: async (key) =>
      (await orm.WorkspaceSetting.where({ trackingKey: key }).first())?.workspaceId ?? null,
    recordExists: async (table, workspaceId, id) =>
      table === "company"
        ? (await orm.Company.where({ id, workspaceId }).first()) !== null
        : (await orm.Contact.where({ id, workspaceId }).first()) !== null,
    contactByEmail: async (workspaceId, email) => {
      const rows = await orm.Contact.where({ workspaceId, email })
        .select("id", "companyId", "archivedAt")
        .limit(10)
        .all();

      const contact = rows.find((row) => row.archivedAt === null) ?? rows[0];

      return contact ? { id: contact.id, companyId: contact.companyId } : null;
    },
    companyByDomain: async (workspaceId, domain) =>
      (await orm.Company.where({ workspaceId, domain }).select("id").first())?.id ?? null,
    visitorMatch: async (workspaceId, visitorId) => {
      // Identifying matches every visit of a visitor, so the latest one carries the match.
      const row = await orm.WebsiteVisit.where({ workspaceId, visitorId })
        .orderBy((visit) => visit.occurredAt.desc())
        .select("contactId", "companyId")
        .first();

      return row && (row.contactId || row.companyId)
        ? { contactId: row.contactId, companyId: row.companyId }
        : null;
    },
    matchVisitor: async (workspaceId, visitorId, match) => {
      const patch: VisitMatchPatch = {};

      if (match.contactId) patch.contactId = match.contactId;

      if (match.companyId) patch.companyId = match.companyId;

      if (patch.contactId || patch.companyId) {
        await orm.WebsiteVisit.where({ workspaceId, visitorId }).updateAll(patch);
      }
    },
    insertVisit: async (visit) => {
      await orm.WebsiteVisit.create({ ...visit });
    },
    visits: async (workspaceId, target) =>
      await orm.WebsiteVisit.where({ workspaceId, ...target })
        .orderBy((visit) => visit.occurredAt.desc())
        .select("path", "referrer", "utmSource", "utmMedium", "utmCampaign", "occurredAt")
        .limit(MAX_ROLLUP_VISITS)
        .all(),
  };
}
