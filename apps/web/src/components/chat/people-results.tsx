import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm/ui/components/table";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { companiesCollection } from "../../lib/companies.ts";
import { contactsCollection } from "../../lib/contacts.ts";
import { addPeopleMutation, companyFor, contactFor, verifiedEmail } from "../../lib/people.ts";
import { useOpenRecord } from "../../lib/records.ts";
import type { PersonResultRow } from "../../lib/tool-results.ts";
import { CompanyCell, NameWithMark, PersonAvatar, MARK_SIZE } from "../records/record-visuals.tsx";

/**
 * People a search found (`crm__find_people`, ADR 0027) as a table in the chat: pick rows and add
 * them to the CRM (each is then researched by itself: email, phone, photo), or ask the agent for
 * their emails. People already in the CRM open their sheet instead.
 */

/** The most rows the table shows; a search returns at most 50. */
const MAX_ROWS = 50;

export function PeopleResults({
  rows,
  onAsk,
}: {
  rows: readonly PersonResultRow[];
  /** Sends the agent a follow-up message, such as asking for the selected people's emails. */
  onAsk: (text: string) => void;
}) {
  const { session } = useRouteContext({ from: "/_authed/_workspace" });
  const workspaceId = session.session.activeOrganizationId ?? "";
  const userId = session.user.id;
  const contactRows = contactsCollection(workspaceId);
  const companyRows = companiesCollection(workspaceId);
  const contacts = useLiveQuery((q) => q.from({ contact: contactRows })).data ?? [];
  const companies = useLiveQuery((q) => q.from({ company: companyRows })).data ?? [];
  const openRecord = useOpenRecord();
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());

  const shown = rows.slice(0, MAX_ROWS);
  const existing = shown.map((row) => contactFor(row, contacts, companies)?.id ?? null);
  const addable = shown.flatMap((_, index) => (existing[index] ? [] : [index]));
  const picked = addable.filter((index) => selected.has(index));
  const allPicked = addable.length > 0 && picked.length === addable.length;

  const toggle = (index: number) =>
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(index)) next.delete(index);
      else next.add(index);

      return next;
    });

  const add = useMutation({
    ...addPeopleMutation,
    onSuccess: (added) => {
      setSelected(new Set());
      toast.success(
        `Added ${added} ${added === 1 ? "person" : "people"}. Their email, phone and photo fill in by themselves.`,
      );
    },
    onError: () => toast.error("Couldn't add everyone. Try again."),
  });

  const askEmails = () => {
    const names = picked.flatMap((index) => {
      const row = shown[index];

      return row ? [row.company ? `${row.name} (${row.company})` : row.name] : [];
    });

    onAsk(`Find verified work emails for ${names.join(", ")}.`);
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border" data-slot="tool-result">
      <Table aria-label="People found">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label="Select everyone not in the CRM"
                checked={allPicked}
                disabled={addable.length === 0}
                indeterminate={picked.length > 0 && !allPicked}
                onCheckedChange={(checked) => setSelected(new Set(checked ? addable : []))}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, index) => {
            const contactId = existing[index];
            const company = companyFor(row, companies);

            return (
              <TableRow
                className="cursor-pointer"
                data-state={selected.has(index) ? "selected" : undefined}
                key={`${row.name}-${row.linkedinUrl ?? index}`}
                onClick={() => (contactId ? openRecord("contact", contactId) : toggle(index))}
              >
                <TableCell>
                  {contactId ? (
                    <span className="text-xs text-muted-foreground select-none">In CRM</span>
                  ) : (
                    <Checkbox
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(index)}
                      onCheckedChange={() => toggle(index)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex max-w-64 min-w-0 flex-col select-text">
                    <NameWithMark
                      mark={<PersonAvatar name={row.name} size={MARK_SIZE} />}
                      name={row.name}
                      strong
                    />
                    {row.title ? (
                      <span className="truncate pl-7 text-xs text-muted-foreground">
                        {row.title}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block max-w-48 min-w-0 select-text">
                    {company ? (
                      <CompanyCell company={company} />
                    ) : row.company ? (
                      <span className="block truncate">{row.company}</span>
                    ) : (
                      <EmptyCellDash />
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block max-w-40 min-w-0 truncate text-muted-foreground select-text">
                    {row.location ?? <EmptyCellDash />}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block text-muted-foreground select-none">
                    {row.email ? (
                      verifiedEmail(row.emailStatus) ? (
                        "Verified"
                      ) : (
                        "Found"
                      )
                    ) : (
                      <EmptyCellDash />
                    )}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5}>
              <div className="flex min-w-0 items-center gap-2 font-normal">
                <span className="min-w-0 flex-1 truncate text-muted-foreground tabular-nums">
                  {rows.length} {rows.length === 1 ? "person" : "people"}
                  {picked.length > 0 ? ` · ${picked.length} selected` : ""}
                </span>
                <Button
                  disabled={picked.length === 0}
                  onClick={askEmails}
                  size="sm"
                  variant="outline"
                >
                  Find emails
                </Button>
                <Button
                  disabled={picked.length === 0}
                  loading={add.isPending}
                  onClick={() =>
                    add.mutate({
                      people: picked.flatMap((index) => (shown[index] ? [shown[index]] : [])),
                      workspaceId,
                      ownerId: userId,
                      companies,
                      contacts,
                      companyRows,
                      contactRows,
                    })
                  }
                  size="sm"
                >
                  Add to CRM
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
