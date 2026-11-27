import { COMPANIES_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { mutationOptions } from "@tanstack/react-query";
import { archivedFlag, pickColumns, syncedRecords } from "./synced-records.ts";

/**
 * A company row exactly as Electric syncs it (snake_case, timestamps as ISO strings). A type
 * alias, not an interface: TanStack DB rows need an implicit index signature.
 */
export type Company = {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly domain: string | null;
  readonly website: string | null;
  readonly description: string | null;
  readonly logo_url: string | null;
  readonly logo_dark_url: string | null;
  readonly icon_url: string | null;
  readonly icon_dark_url: string | null;
  readonly icon_tone: string | null;
  readonly brand_color: string | null;
  readonly industry: string | null;
  readonly sub_industry: string | null;
  readonly city: string | null;
  readonly state_code: string | null;
  readonly country: string | null;
  readonly country_code: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly linkedin_url: string | null;
  readonly twitter_url: string | null;
  readonly github_url: string | null;
  readonly pricing_url: string | null;
  readonly careers_url: string | null;
  readonly owner_id: string | null;
  readonly primary_contact_id: string | null;
  /** Headcount as research states it ("15", "51-200"), and the year it was founded. */
  readonly employee_count: string | null;
  readonly founded_year: string | null;
  readonly enrichment_status: string;
  readonly enriched_at: string | null;
  readonly enrichment_error: string | null;
  readonly source: string;
  readonly last_activity_at: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export interface CompanyInput {
  readonly name: string;
  readonly domain: string | null;
}

/** The columns members edit (`UpdateCompany` in `@crm/core/api`). */
const EDITABLE = [
  "name",
  "domain",
  "website",
  "phone",
  "email",
  "industry",
  "city",
  "country",
  "employee_count",
  "founded_year",
  "owner_id",
  "description",
  "linkedin_url",
  "twitter_url",
  "github_url",
  "primary_contact_id",
] as const;

/** The synced companies of a workspace: one collection per workspace, created on first use. */
export const companiesCollection = syncedRecords<Company>({
  name: "companies",
  syncPath: COMPANIES_SYNC_PATH,
  writePath: "/api/companies",
  createBody: (row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    owner_id: row.owner_id,
  }),
  patchBody: (changes) => ({ ...pickColumns(changes, EDITABLE), ...archivedFlag(changes) }),
});

export type CompaniesCollection = ReturnType<typeof companiesCollection>;

/** A new company row for an optimistic insert; the server fills the rest as it stores it. */
export function newCompany(input: {
  workspaceId: string;
  ownerId: string | null;
  name: string;
  domain: string | null;
}): Company {
  const now = new Date().toISOString();

  return {
    id: createId(ID_PREFIXES.company),
    workspace_id: input.workspaceId,
    name: input.name,
    domain: input.domain,
    website: input.domain ? `https://${input.domain}` : null,
    description: null,
    logo_url: null,
    logo_dark_url: null,
    icon_url: null,
    icon_dark_url: null,
    icon_tone: null,
    brand_color: null,
    industry: null,
    sub_industry: null,
    city: null,
    state_code: null,
    country: null,
    country_code: null,
    phone: null,
    email: null,
    linkedin_url: null,
    twitter_url: null,
    github_url: null,
    pricing_url: null,
    careers_url: null,
    employee_count: null,
    founded_year: null,
    owner_id: input.ownerId,
    primary_contact_id: null,
    enrichment_status: "pending",
    enriched_at: null,
    enrichment_error: null,
    source: "manual",
    last_activity_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  };
}

interface CreateCompany {
  readonly collection: CompaniesCollection;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly input: CompanyInput;
}

/**
 * Adds a company: it appears in the list at once (optimistic) and the mutation settles when the
 * server has stored it and the row has come back through sync. A rejection rolls it back.
 */
export const createCompanyMutation = mutationOptions({
  mutationKey: ["companies", "create"],
  mutationFn: async ({ collection, workspaceId, ownerId, input }: CreateCompany) => {
    const row = newCompany({ workspaceId, ownerId, name: input.name, domain: input.domain });

    await collection.insert(row).when("settled");

    return row.id;
  },
});

/** The enrich endpoint's reply: `queued` on success, an error schema's `message` on failure. */
interface EnrichReply {
  readonly queued?: boolean;
  readonly message?: string;
}

/** Re-enrich: the API copies the logo again and refreshes website research in the background. */
export const enrichCompanyMutation = mutationOptions({
  mutationKey: ["companies", "enrich"],
  mutationFn: async (id: string) => {
    const response = await fetch(`/api/companies/${encodeURIComponent(id)}/enrich`, {
      method: "POST",
      credentials: "same-origin",
    });

    const body: EnrichReply = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(body.message ?? "Couldn't re-enrich");

    return body.queued === true;
  },
});
