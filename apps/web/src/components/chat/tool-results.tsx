import { formatMoneyCompact, isOpenStage, REPORTING_CURRENCY } from "@crm/core/records";
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
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type Company, companiesCollection } from "../../lib/companies.ts";
import { contactsCollection } from "../../lib/contacts.ts";
import { calendarDate } from "../../lib/record-format.ts";
import { type RecordKind, useOpenRecord } from "../../lib/records.ts";
import type {
  CompanyResultRow,
  ContactResultRow,
  DealResultRow,
  ListResult,
} from "../../lib/tool-results.ts";
import {
  CompanyCell,
  MoneyCell,
  NameWithMark,
  PersonAvatar,
  StageLabel,
  MARK_SIZE,
} from "../records/record-visuals.tsx";

/** At most this many rows show; the footer says how many there are. */
const MAX_ROWS = 25;

type CompaniesById = ReadonlyMap<string, Company>;

/** One column: its header and how a row's cell reads, with the synced companies for logos. */
interface Column<Row> {
  readonly header: string;
  readonly cell: (row: Row, companies: CompaniesById) => ReactNode;
  readonly end?: boolean;
}

/** A company's logo and name from the synced copy, else the name the tool gave. */
function CompanyMark({
  id,
  name,
  companies,
}: {
  id: string | null;
  name: string | null;
  companies: CompaniesById;
}) {
  const company = id ? companies.get(id) : undefined;

  if (company) return <CompanyCell company={company} />;

  if (!name) return <EmptyCellDash />;

  return (
    <CompanyCell
      company={{ name, icon_url: null, logo_url: null, icon_dark_url: null, icon_tone: null }}
    />
  );
}

function Quiet({ children }: { children: string | null }) {
  return children ? <span className="block truncate">{children}</span> : <EmptyCellDash />;
}

const DEAL_COLUMNS: readonly Column<DealResultRow>[] = [
  { header: "Deal", cell: (deal) => <span className="truncate font-medium">{deal.name}</span> },
  {
    header: "Company",
    cell: (deal, companies) => (
      <CompanyMark companies={companies} id={deal.companyId} name={deal.companyName} />
    ),
  },
  { header: "Stage", cell: (deal) => <StageLabel stage={deal.stage} /> },
  {
    header: "Amount",
    end: true,
    cell: (deal) => <MoneyCell amount={deal.amount} currency={deal.currency} />,
  },
  { header: "Close", cell: (deal) => <Quiet>{calendarDate(deal.expectedCloseDate)}</Quiet> },
];

const COMPANY_COLUMNS: readonly Column<CompanyResultRow>[] = [
  {
    header: "Company",
    cell: (company, companies) => (
      <CompanyMark companies={companies} id={company.id} name={company.name} />
    ),
  },
  { header: "Industry", cell: (company) => <Quiet>{company.industry}</Quiet> },
  { header: "Location", cell: (company) => <Quiet>{company.location}</Quiet> },
  {
    header: "Open deals",
    end: true,
    cell: (company) => <span className="tabular-nums">{company.openDeals}</span>,
  },
];

const CONTACT_COLUMNS: readonly Column<ContactResultRow>[] = [
  {
    header: "Name",
    cell: (contact) => (
      <NameWithMark
        mark={<ContactPhoto id={contact.id} name={contact.name} />}
        name={contact.name}
        strong
      />
    ),
  },
  { header: "Title", cell: (contact) => <Quiet>{contact.title}</Quiet> },
  {
    header: "Company",
    cell: (contact, companies) => (
      <CompanyMark companies={companies} id={contact.companyId} name={contact.companyName} />
    ),
  },
  { header: "Email", cell: (contact) => <Quiet>{contact.email}</Quiet> },
];

/** A contact's photo from the synced contacts, or their initials, at the table size. */
function ContactPhoto({ id, name }: { id: string; name: string }) {
  const { session } = useRouteContext({ from: "/_authed/_workspace" });
  const collection = contactsCollection(session.session.activeOrganizationId ?? "");

  const synced = useLiveQuery({
    query: (q) => q.from({ row: collection }).where(({ row }) => eq(row.id, id)),
  }).data?.[0];

  return <PersonAvatar name={name} size={MARK_SIZE} src={synced?.image_url ?? null} />;
}

/** The synced companies by id, for logos. */
function useCompaniesById(): CompaniesById {
  const { session } = useRouteContext({ from: "/_authed/_workspace" });
  const collection = companiesCollection(session.session.activeOrganizationId ?? "");
  const rows = useLiveQuery((q) => q.from({ company: collection })).data ?? [];

  return new Map(rows.map((company) => [company.id, company]));
}

/** A framed table whose rows open their record's sheet, with a summary footer. */
function ResultTable<Row extends { readonly id: string }>({
  label,
  kind,
  rows,
  columns,
  footer,
}: {
  label: string;
  kind: RecordKind;
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  footer: string;
}) {
  const openRecord = useOpenRecord();
  const companies = useCompaniesById();

  return (
    <div className="my-2 overflow-hidden rounded-lg border" data-slot="tool-result">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header}>
                <span className="block data-[end]:text-right" data-end={column.end || undefined}>
                  {column.header}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, MAX_ROWS).map((row) => (
            <TableRow
              className="cursor-pointer"
              key={row.id}
              onClick={() => openRecord(kind, row.id)}
            >
              {columns.map((column, index) => (
                <TableCell key={column.header}>
                  {index === 0 ? (
                    <button
                      className="flex max-w-56 min-w-0 outline-none focus-visible:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRecord(kind, row.id);
                      }}
                      type="button"
                    >
                      {column.cell(row, companies)}
                    </button>
                  ) : (
                    <span
                      className="block max-w-56 min-w-0 truncate data-[end]:text-right"
                      data-end={column.end || undefined}
                    >
                      {column.cell(row, companies)}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={columns.length}>
              <span className="font-normal text-muted-foreground tabular-nums">{footer}</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

const count = (rows: number, one: string, many = `${one}s`) => `${rows} ${rows === 1 ? one : many}`;

/** " · showing 25" when rows were cut. */
const cut = (rows: number) => (rows > MAX_ROWS ? ` · showing ${MAX_ROWS}` : "");

/** "4 deals · $1.2M pipeline": open deals in the reporting currency, others counted apart. */
function dealsFooter(deals: readonly DealResultRow[]) {
  const open = deals.filter((deal) => isOpenStage(deal.stage));
  const counted = open.filter((deal) => deal.currency === REPORTING_CURRENCY);
  const total = counted.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0);
  const other = open.length - counted.length;
  const others = other > 0 ? ` (+${other} in other currencies)` : "";

  return `${count(deals.length, "deal")} · ${formatMoneyCompact(total)} pipeline${others}${cut(deals.length)}`;
}

/**
 * The result of a CRM list call as a table in the chat (ADR 0024): deals with their company's
 * logo, stage, amount and close date and a pipeline total; companies with their logo; contacts
 * with their company. Every row opens its record's sheet.
 */
export function ToolResultTable({ result }: { result: ListResult }) {
  if (result.kind === "deals") {
    return (
      <ResultTable
        columns={DEAL_COLUMNS}
        footer={dealsFooter(result.rows)}
        kind="deal"
        label="Deals"
        rows={result.rows}
      />
    );
  }

  if (result.kind === "companies") {
    return (
      <ResultTable
        columns={COMPANY_COLUMNS}
        footer={`${count(result.rows.length, "company", "companies")}${cut(result.rows.length)}`}
        kind="company"
        label="Companies"
        rows={result.rows}
      />
    );
  }

  return (
    <ResultTable
      columns={CONTACT_COLUMNS}
      footer={`${count(result.rows.length, "contact")}${cut(result.rows.length)}`}
      kind="contact"
      label="Contacts"
      rows={result.rows}
    />
  );
}
