import type { Pool } from "pg";
import type {
  CrmDirectory,
  DirectoryCompany,
  DirectoryContact,
  DirectoryDeal,
} from "./crm-tools.ts";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  owner_name: string | null;
  contacts: number;
  open_deals: number;
  last_activity_at: Date | null;
  created_at: Date;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

const toCompany = (row: CompanyRow): DirectoryCompany => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  industry: row.industry,
  location: [row.city, row.country].filter(Boolean).join(", ") || null,
  description: row.description,
  ownerName: row.owner_name,
  contacts: Number(row.contacts),
  openDeals: Number(row.open_deals),
  lastActivityAt: iso(row.last_activity_at),
  createdAt: row.created_at.toISOString(),
});

const OPEN_STAGES = "('demo_booked','qualified_to_buy','decision_maker_bought_in','contract_sent')";

const COMPANY_COLUMNS = `c.id, c.name, c.domain, c.industry, c.city, c.country, c.description, u.name AS owner_name,
  (SELECT count(*) FROM contact x WHERE x.company_id = c.id AND x.archived_at IS NULL) AS contacts,
  (SELECT count(*) FROM deal d WHERE d.company_id = c.id AND d.archived_at IS NULL AND d.stage IN ${OPEN_STAGES}) AS open_deals,
  c.last_activity_at, c.created_at
  FROM company c LEFT JOIN "user" u ON u.id = c.owner_id`;

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  company_id: string | null;
  company_name: string | null;
  owner_name: string | null;
  last_activity_at: Date | null;
}

const toContact = (row: ContactRow): DirectoryContact => ({
  id: row.id,
  name: [row.first_name, row.last_name].filter(Boolean).join(" "),
  title: row.title,
  email: row.email,
  phone: row.phone,
  companyId: row.company_id,
  companyName: row.company_name,
  ownerName: row.owner_name,
  lastActivityAt: iso(row.last_activity_at),
});

const CONTACT_COLUMNS = `p.id, p.first_name, p.last_name, p.title, p.email, p.phone, p.company_id,
  c.name AS company_name, u.name AS owner_name, p.last_activity_at
  FROM contact p LEFT JOIN company c ON c.id = p.company_id LEFT JOIN "user" u ON u.id = p.owner_id`;

interface DealRow {
  id: string;
  name: string;
  stage: string;
  amount: string | null;
  currency: string;
  expected_close_date: string | Date | null;
  company_id: string;
  company_name: string;
  owner_name: string | null;
  description: string | null;
  closed_reason: string | null;
  last_activity_at: Date | null;
}

const toDeal = (row: DealRow): DirectoryDeal => ({
  id: row.id,
  name: row.name,
  stage: row.stage,
  amount: row.amount,
  currency: row.currency,
  expectedCloseDate:
    row.expected_close_date instanceof Date
      ? row.expected_close_date.toISOString().slice(0, 10)
      : row.expected_close_date,
  companyId: row.company_id,
  companyName: row.company_name,
  ownerName: row.owner_name,
  description: row.description,
  closedReason: row.closed_reason,
  lastActivityAt: iso(row.last_activity_at),
});

const DEAL_COLUMNS = `d.id, d.name, d.stage, d.amount::text AS amount, d.currency, d.expected_close_date::text AS expected_close_date,
  d.company_id, c.name AS company_name, u.name AS owner_name, d.description, d.closed_reason, d.last_activity_at
  FROM deal d JOIN company c ON c.id = d.company_id LEFT JOIN "user" u ON u.id = d.owner_id`;

/** `%` and `_` in a search are literal text, not patterns. */
const likeText = (query: string) => query.replaceAll(/[\\%_]/g, (match) => `\\${match}`);

/** The tools' reads, as parameterised SQL over the shared pool. Always scoped to one workspace. */
export function postgresDirectory(pool: Pool): CrmDirectory {
  return {
    companies: async (workspaceId, query, limit) => {
      const { rows } = await pool.query<CompanyRow>(
        `SELECT ${COMPANY_COLUMNS} WHERE c.workspace_id = $1 AND c.archived_at IS NULL AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.domain ILIKE '%' || $2 || '%') ORDER BY lower(c.name) LIMIT $3`,
        [workspaceId, likeText(query), limit],
      );

      return rows.map(toCompany);
    },
    company: async (workspaceId, id) => {
      const { rows } = await pool.query<CompanyRow>(
        `SELECT ${COMPANY_COLUMNS} WHERE c.workspace_id = $1 AND c.id = $2`,
        [workspaceId, id],
      );

      return rows[0] ? toCompany(rows[0]) : null;
    },
    contacts: async (workspaceId, query, filter, limit) => {
      const { rows } = await pool.query<ContactRow>(
        `SELECT ${CONTACT_COLUMNS} WHERE p.workspace_id = $1 AND p.archived_at IS NULL AND ($3 = '' OR p.company_id = $3)
          AND ($5 = '' OR p.id IN (SELECT dc.contact_id FROM deal_contact dc WHERE dc.workspace_id = $1 AND dc.deal_id = $5))
          AND ($2 = '' OR (p.first_name || ' ' || coalesce(p.last_name, '')) ILIKE '%' || $2 || '%' OR p.email ILIKE '%' || $2 || '%' OR p.title ILIKE '%' || $2 || '%')
          ORDER BY lower(p.first_name), lower(coalesce(p.last_name, '')) LIMIT $4`,
        [workspaceId, likeText(query), filter.companyId, limit, filter.dealId],
      );

      return rows.map(toContact);
    },
    contact: async (workspaceId, id) => {
      const { rows } = await pool.query<ContactRow>(
        `SELECT ${CONTACT_COLUMNS} WHERE p.workspace_id = $1 AND p.id = $2`,
        [workspaceId, id],
      );

      return rows[0] ? toContact(rows[0]) : null;
    },
    deals: async (workspaceId, query, filter, limit) => {
      const { rows } = await pool.query<DealRow>(
        `SELECT ${DEAL_COLUMNS} WHERE d.workspace_id = $1 AND d.archived_at IS NULL AND ($3 = '' OR d.company_id = $3)
          AND ($4 = '' OR ($4 = 'open' AND d.stage IN ${OPEN_STAGES}) OR ($4 = 'closed' AND d.stage NOT IN ${OPEN_STAGES}) OR d.stage = $4)
          AND ($6 = '' OR d.id IN (SELECT dc.deal_id FROM deal_contact dc WHERE dc.workspace_id = $1 AND dc.contact_id = $6))
          AND ($2 = '' OR d.name ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%')
          ORDER BY d.expected_close_date NULLS LAST, lower(d.name) LIMIT $5`,
        [workspaceId, likeText(query), filter.companyId, filter.stage, limit, filter.contactId],
      );

      return rows.map(toDeal);
    },
    deal: async (workspaceId, id) => {
      const { rows } = await pool.query<DealRow>(
        `SELECT ${DEAL_COLUMNS} WHERE d.workspace_id = $1 AND d.id = $2`,
        [workspaceId, id],
      );

      return rows[0] ? toDeal(rows[0]) : null;
    },
    members: async (workspaceId) => {
      const { rows } = await pool.query<{ id: string; name: string; email: string; role: string }>(
        'SELECT u.id, u.name, u.email, m.role FROM member m JOIN "user" u ON u.id = m."userId" WHERE m."organizationId" = $1 ORDER BY lower(u.name)',
        [workspaceId],
      );

      return rows;
    },
    workspace: async (workspaceId) => {
      const { rows } = await pool.query<{ name: string; website: string }>(
        "SELECT name, website FROM workspace WHERE id = $1",
        [workspaceId],
      );

      return rows[0] ?? null;
    },
  };
}
