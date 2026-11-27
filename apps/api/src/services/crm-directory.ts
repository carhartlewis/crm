import type { Pool } from "pg";
import type { CrmDirectory, DirectoryCompany } from "./crm-tools.ts";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  owner_name: string | null;
  created_at: Date;
}

const toCompany = (row: CompanyRow): DirectoryCompany => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  ownerName: row.owner_name,
  createdAt: row.created_at.toISOString(),
});

const COMPANY_COLUMNS =
  'c.id, c.name, c.domain, u.name AS owner_name, c.created_at FROM company c LEFT JOIN "user" u ON u.id = c.owner_id';

/** `%` and `_` in a search are literal text, not patterns. */
const likeText = (query: string) => query.replaceAll(/[\\%_]/g, (match) => `\\${match}`);

/** The tools' reads, as parameterised SQL over the shared pool. Always scoped to one workspace. */
export function postgresDirectory(pool: Pool): CrmDirectory {
  return {
    companies: async (workspaceId, query, limit) => {
      const { rows } = await pool.query<CompanyRow>(
        `SELECT ${COMPANY_COLUMNS} WHERE c.workspace_id = $1 AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.domain ILIKE '%' || $2 || '%') ORDER BY lower(c.name) LIMIT $3`,
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
    members: async (workspaceId) => {
      const { rows } = await pool.query<{ name: string; email: string; role: string }>(
        'SELECT u.name, u.email, m.role FROM member m JOIN "user" u ON u.id = m."userId" WHERE m."organizationId" = $1 ORDER BY lower(u.name)',
        [workspaceId],
      );

      return rows;
    },
  };
}
