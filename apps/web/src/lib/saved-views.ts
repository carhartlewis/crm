import { SAVED_VIEWS_SYNC_PATH } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import type { SavedViewEntity } from "@crm/core/views";
import {
  LIST_SEARCH_PARAM,
  type ListSearchParams,
} from "@crm/ui/patterns/data-table/list-search-params";
import { scopedKey } from "@crm/ui/patterns/data-table/table-query";
import { useLiveQuery } from "@tanstack/react-db";
import { pickColumns, syncedRecords } from "./synced-records.ts";

/**
 * Saved list views (ADR 0024): a name and a list's URL query. Applying a view writes its query
 * back to the URL, so a view and a link are the same thing.
 */

/** A saved view as Electric syncs it: the workspace's shared views and the caller's own. */
export type SavedView = {
  readonly id: string;
  readonly workspace_id: string;
  readonly owner_id: string | null;
  readonly entity: string;
  readonly name: string;
  readonly shared: boolean;
  readonly query: string;
  readonly position: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export const savedViewsCollection = syncedRecords<SavedView>({
  name: "saved-views",
  syncPath: SAVED_VIEWS_SYNC_PATH,
  writePath: "/api/saved-views",
  createBody: (row) => ({
    id: row.id,
    entity: row.entity,
    name: row.name,
    query: row.query,
    shared: row.shared,
  }),
  patchBody: (changes) => pickColumns(changes, ["name", "query", "shared"]),
});

/** One list's views, by name. */
export function useSavedViews(workspaceId: string, entity: SavedViewEntity) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ view: savedViewsCollection(workspaceId) }),
  });

  return data
    .filter((view) => view.entity === entity)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function newSavedView(
  workspaceId: string,
  ownerId: string,
  input: { entity: SavedViewEntity; name: string; query: string; shared: boolean },
): SavedView {
  const now = new Date().toISOString();

  return {
    id: createId(ID_PREFIXES.saved_view),
    workspace_id: workspaceId,
    owner_id: ownerId,
    ...input,
    position: 0,
    created_at: now,
    updated_at: now,
  };
}

/** The URL keys a list owns: search, sort, filters, tabs and hidden columns, never the page. */
export function listKeys<Tab extends string, Facet extends string>(
  params: ListSearchParams<Tab, Facet>,
) {
  const keys = Object.keys(params.parsers)
    .filter((key) => key !== LIST_SEARCH_PARAM.page)
    .map((key) => params.urlKeys[key] ?? key);

  return new Set([...keys, scopedKey(params.config.scope, LIST_SEARCH_PARAM.hide)]);
}

/** A list's own part of a query string, keys sorted: what a view saves and compares. */
export function listQuery(search: string, keys: ReadonlySet<string>) {
  const kept = [...new URLSearchParams(search)].filter(([key]) => keys.has(key));

  kept.sort(([left], [right]) => left.localeCompare(right));

  return new URLSearchParams(kept).toString();
}

/**
 * The query string with the list's part replaced by `query`; everything else (an open sheet)
 * stays. An empty `query` clears the list back to its defaults.
 */
export function withListQuery(search: string, keys: ReadonlySet<string>, query: string) {
  const others = [...new URLSearchParams(search)].filter(([key]) => !keys.has(key));
  const next = new URLSearchParams([...others, ...new URLSearchParams(query)]).toString();

  return next ? `?${next}` : "";
}
