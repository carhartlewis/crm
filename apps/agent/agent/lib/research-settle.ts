import type { CrmCaller } from "./crm-caller.ts";

/** What the API needs when a research session's turn ends (ADR 0025, 0030). */
export interface Settlement {
  /** The queue job whose slot the session held; it goes to the next job. */
  readonly job: string | null;
  /** A company or contact whose status the session may have left open. */
  readonly record: { readonly kind: "company" | "contact"; readonly id: string } | null;
  /** `completed`, `failed`, `cancelled`, or `paused` when the turn waits for a person. */
  readonly outcome: string;
}

/**
 * Only background research settles anything; a chat, even in a record's Agent tab, never does.
 * Sessions started before the queue carry no job: a record's job id is `research-<id>`.
 */
/** A company or contact has a research status to close; a deal has none. */
function statusRecord(record: CrmCaller["record"]): Settlement["record"] {
  return record && (record.kind === "company" || record.kind === "contact")
    ? { kind: record.kind, id: record.id }
    : null;
}

export function settlement(caller: CrmCaller | null, outcome: string): Settlement | null {
  if (caller?.origin !== "research" || !caller.workspaceId) return null;

  const { record } = caller;
  const job = caller.researchJob ?? (record ? `research-${record.id}` : null);
  const settles = statusRecord(record);

  return job || settles ? { job, record: settles, outcome } : null;
}
