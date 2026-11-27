import { CONTACTS_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import { mutationOptions } from "@tanstack/react-query";
import { archivedFlag, pickColumns, syncedRecords } from "./synced-records.ts";

/** A contact row exactly as Electric syncs it. */
export type Contact = {
  readonly id: string;
  readonly workspace_id: string;
  readonly first_name: string;
  readonly last_name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly title: string | null;
  readonly seniority: string | null;
  readonly function: string | null;
  readonly linkedin_url: string | null;
  readonly twitter_url: string | null;
  readonly github_url: string | null;
  readonly image_url: string | null;
  readonly company_id: string | null;
  readonly owner_id: string | null;
  readonly enrichment_status: string;
  readonly enriched_at: string | null;
  readonly enrichment_error: string | null;
  readonly source: string;
  readonly last_activity_at: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

const EDITABLE = [
  "first_name",
  "last_name",
  "title",
  "email",
  "phone",
  "linkedin_url",
  "twitter_url",
  "github_url",
  "seniority",
  "function",
  "company_id",
  "owner_id",
] as const;

export const contactsCollection = syncedRecords<Contact>({
  name: "contacts",
  syncPath: CONTACTS_SYNC_PATH,
  writePath: "/api/contacts",
  createBody: (row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    company_id: row.company_id,
    owner_id: row.owner_id,
  }),
  patchBody: (changes) => ({ ...pickColumns(changes, EDITABLE), ...archivedFlag(changes) }),
});

export type ContactsCollection = ReturnType<typeof contactsCollection>;

export interface ContactInput {
  readonly first_name: string;
  readonly last_name: string | null;
  readonly email: string | null;
  readonly title: string | null;
  readonly phone: string | null;
  readonly company_id: string | null;
}

export function newContact(
  workspaceId: string,
  ownerId: string | null,
  input: ContactInput,
): Contact {
  const now = new Date().toISOString();

  return {
    id: createId(ID_PREFIXES.contact),
    workspace_id: workspaceId,
    ...input,
    seniority: null,
    function: null,
    linkedin_url: null,
    twitter_url: null,
    github_url: null,
    image_url: null,
    owner_id: ownerId,
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

export const createContactMutation = mutationOptions({
  mutationKey: ["contacts", "create"],
  mutationFn: async (args: {
    collection: ContactsCollection;
    workspaceId: string;
    ownerId: string;
    input: ContactInput;
  }) => {
    const row = newContact(args.workspaceId, args.ownerId, args.input);

    await args.collection.insert(row).when("settled");

    return row.id;
  },
});
