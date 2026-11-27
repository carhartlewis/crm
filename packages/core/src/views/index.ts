/**
 * Saved list views (ADR 0024): a name and the list's URL query, personal or shared with the
 * workspace. Client-safe rules shared by the API and the Views menu.
 */

import type { FieldResult } from "../records/index.ts";
import { ID_PREFIXES, isRecordId } from "../ids/index.ts";

/** The lists that have saved views. */
export const SAVED_VIEW_ENTITIES = ["company", "contact", "deal"] as const;

export type SavedViewEntity = (typeof SAVED_VIEW_ENTITIES)[number];

const ENTITIES = new Set<string>(SAVED_VIEW_ENTITIES);

export function isSavedViewEntity(value: string): value is SavedViewEntity {
  return ENTITIES.has(value);
}

export const isSavedViewId = (value: string) => isRecordId(ID_PREFIXES.saved_view, value);

/** A view's name: trimmed, whitespace collapsed, 1 to 60 characters. */
export function viewName(input: string): FieldResult<string> {
  const name = input.trim().replaceAll(/\s+/g, " ");

  if (!name) return { ok: false, message: "Name the view" };

  return name.length > 60
    ? { ok: false, message: "Keep it under 60 characters" }
    : { ok: true, value: name };
}

/**
 * A list's query as a view stores it: no leading `?`, no page number, keys sorted so the same
 * filters always read the same, at most 4,000 characters. The browser sends only the list's own
 * keys (search, sort, filters, columns), never the sheets open over it.
 */
export function viewQuery(input: string): FieldResult<string> {
  const params = new URLSearchParams(input.trim().replace(/^\?/, ""));
  const kept = [...params].filter(([key]) => key !== "page");

  kept.sort(([left], [right]) => left.localeCompare(right));

  const query = new URLSearchParams(kept).toString();

  return query.length > 4000
    ? { ok: false, message: "That view has too many filters to save" }
    : { ok: true, value: query };
}

/** Who may see a view: anyone in the workspace when shared, otherwise its owner. */
export function canSeeView(view: { shared: boolean; ownerId: string | null }, userId: string) {
  return view.shared || view.ownerId === userId;
}

/** Who may rename, share or delete a view: any member when shared, otherwise its owner. */
export const canEditView = canSeeView;
