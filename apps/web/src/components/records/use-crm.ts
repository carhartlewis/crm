import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import { activitiesCollection } from "../../lib/activities.ts";
import { companiesCollection } from "../../lib/companies.ts";
import { contactsCollection } from "../../lib/contacts.ts";
import { dealContactsCollection, dealsCollection } from "../../lib/deals.ts";
import { workspaceQuery } from "../../lib/session.ts";

/**
 * Live reads of a workspace's synced records. Each hook subscribes to one collection (which
 * starts its sync), so a page reads only what it shows and every filter runs locally.
 */

export function useCompanies(workspaceId: string) {
  const { data = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ company: companiesCollection(workspaceId) }),
  });

  return { companies: data, loading: isLoading };
}

export function useContacts(workspaceId: string) {
  const { data = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ contact: contactsCollection(workspaceId) }),
  });

  return { contacts: data, loading: isLoading };
}

export function useDeals(workspaceId: string) {
  const { data = [], isLoading } = useLiveQuery({
    query: (q) => q.from({ deal: dealsCollection(workspaceId) }),
  });

  return { deals: data, loading: isLoading };
}

export function useDealContacts(workspaceId: string) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ link: dealContactsCollection(workspaceId) }),
  });

  return data;
}

export function useActivities(workspaceId: string) {
  const { data = [] } = useLiveQuery({
    query: (q) => q.from({ activity: activitiesCollection(workspaceId) }),
  });

  return data;
}

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly image: string | null;
}

/** The workspace's members, for owner names and owner pickers. */
export function useMembers(userId: string, workspaceId: string) {
  const { data: workspace } = useQuery(workspaceQuery(userId, workspaceId));

  const members: readonly Member[] = (workspace?.members ?? []).map((member) => ({
    id: member.userId,
    name: member.user.name,
    image: member.user.image ?? null,
  }));

  const memberOf = (id: string | null | undefined) =>
    id ? (members.find((member) => member.id === id) ?? null) : null;

  const nameOf = (id: string | null | undefined) => memberOf(id)?.name ?? null;

  return { members, memberOf, nameOf };
}

/** Rows by id, for joins in render (a company's name on a deal row). */
export function byId<R extends { readonly id: string }>(rows: readonly R[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

/** Counts rows by a key, such as contacts per company. */
export function countBy<R>(rows: readonly R[], key: (row: R) => string | null) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = key(row);

    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}
