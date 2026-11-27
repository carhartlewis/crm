import { ACTIVITIES_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import type { LoggedActivityType } from "@crm/core/records";
import { pickColumns, syncedRecords } from "./synced-records.ts";

/** An activity row exactly as Electric syncs it. */
export type Activity = {
  readonly id: string;
  readonly workspace_id: string;
  readonly type: string;
  readonly subject: string | null;
  readonly body: string | null;
  readonly occurred_at: string;
  readonly due_at: string | null;
  readonly completed_at: string | null;
  readonly company_id: string | null;
  readonly contact_id: string | null;
  readonly deal_id: string | null;
  readonly created_by_id: string | null;
  readonly meta: {
    readonly from?: string;
    readonly to?: string;
    readonly reason?: string;
    /** Email threads the agent logged (ADR 0024). */
    readonly messages?: number;
    readonly lastReplyAt?: string | null;
    /** Calendar events the agent logged. */
    readonly durationMinutes?: number;
    readonly attendees?: number;
  } | null;
  /** `manual`, `email`, `calendar` or `agent`: who logged it. */
  readonly source?: string;
  /** The thread or event it came from, opened outside the app. */
  readonly external_url?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export const activitiesCollection = syncedRecords<Activity>({
  name: "activities",
  syncPath: ACTIVITIES_SYNC_PATH,
  writePath: "/api/activities",
  createBody: (row) => ({
    id: row.id,
    type: row.type,
    subject: row.subject,
    body: row.body,
    occurred_at: row.occurred_at,
    due_at: row.due_at,
    company_id: row.company_id,
    contact_id: row.contact_id,
    deal_id: row.deal_id,
  }),
  patchBody: (changes) => {
    const body: ReturnType<typeof pickColumns> = pickColumns(changes, [
      "subject",
      "body",
      "due_at",
    ]);

    // A task ticked or unticked becomes the API's `completed` flag.
    if (changes.completed_at !== undefined) body["completed"] = changes.completed_at !== null;

    return body;
  },
});

export type ActivitiesCollection = ReturnType<typeof activitiesCollection>;

export function newActivity(input: {
  workspaceId: string;
  userId: string;
  type: LoggedActivityType;
  subject: string | null;
  body: string | null;
  dueAt: string | null;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
}): Activity {
  const now = new Date().toISOString();

  return {
    id: createId(ID_PREFIXES.activity),
    workspace_id: input.workspaceId,
    type: input.type,
    subject: input.subject,
    body: input.body,
    occurred_at: now,
    due_at: input.type === "task" ? input.dueAt : null,
    completed_at: null,
    company_id: input.companyId,
    contact_id: input.contactId,
    deal_id: input.dealId,
    created_by_id: input.userId,
    meta: null,
    created_at: now,
    updated_at: now,
  };
}
