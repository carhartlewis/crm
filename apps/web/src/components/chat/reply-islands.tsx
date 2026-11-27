import { contactName, dealStage, formatMoney } from "@crm/core/records";
import { MessageResponse } from "@crm/ui/components/ai-elements/message";
import type { ReactiveIslands } from "@crm/ui/components/markdown";
import { RecordChip, RecordList, type RecordListItem } from "@crm/ui/patterns/record-list";
import { useLiveQuery } from "@tanstack/react-db";
import { useRouteContext } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { companiesCollection } from "../../lib/companies.ts";
import { contactsCollection } from "../../lib/contacts.ts";
import { dealsCollection } from "../../lib/deals.ts";
import { type RecordKind, useOpenRecord } from "../../lib/records.ts";
import { type MentionableRecord, tidyReply } from "../../lib/reply-markdown.ts";
import { CompanyLogo, ContactAvatar } from "../records/record-visuals.tsx";

/** ```` ```island-records ```` : CRM records the reply lists, by id, in the reply's order. */
const RecordsIsland = Schema.Struct({
  kind: Schema.Literals(["company", "contact", "deal"]),
  ids: Schema.Array(Schema.String),
});

/** `:company[Capgo]{record="com_…"}` (or `:contact`, `:deal`): a record named in a sentence. */
const Mention = Schema.Struct({
  label: Schema.String,
  record: Schema.String,
});

const decodeRecords = Schema.decodeUnknownOption(RecordsIsland);
const decodeMention = Schema.decodeUnknownOption(Mention);

function useWorkspaceId() {
  const { session } = useRouteContext({ from: "/_authed/_workspace" });

  return session.session.activeOrganizationId ?? "";
}

function useCompanies() {
  const collection = companiesCollection(useWorkspaceId());

  return useLiveQuery((q) => q.from({ company: collection })).data ?? [];
}

function useContacts() {
  const collection = contactsCollection(useWorkspaceId());

  return useLiveQuery((q) => q.from({ contact: collection })).data ?? [];
}

function useDeals() {
  const collection = dealsCollection(useWorkspaceId());

  return useLiveQuery((q) => q.from({ deal: collection })).data ?? [];
}

const LIST_LABELS = { company: "Companies", contact: "Contacts", deal: "Deals" } as const;

/**
 * The listed records that exist, from the synced copies, with their logo or avatar; each row
 * opens its sheet.
 */
function RecordsList({ kind, ids }: { kind: RecordKind; ids: readonly string[] }) {
  const companies = useCompanies();
  const contacts = useContacts();
  const deals = useDeals();
  const openRecord = useOpenRecord();
  const companiesById = new Map(companies.map((company) => [company.id, company]));

  const itemFor = (id: string): RecordListItem | null => {
    if (kind === "company") {
      const company = companiesById.get(id);

      return company
        ? {
            id,
            title: company.name,
            meta: company.domain,
            icon: <CompanyLogo company={company} size="xs" />,
          }
        : null;
    }

    if (kind === "contact") {
      const contact = contacts.find((entry) => entry.id === id);
      const company = contact?.company_id ? companiesById.get(contact.company_id) : undefined;

      return contact
        ? {
            id,
            title: contactName(contact),
            meta: [contact.title, company?.name].filter(Boolean).join(" · ") || null,
            icon: <ContactAvatar contact={contact} size="xs" />,
          }
        : null;
    }

    const deal = deals.find((entry) => entry.id === id);
    const company = deal ? companiesById.get(deal.company_id) : undefined;

    return deal
      ? {
          id,
          title: deal.name,
          meta: [dealStage(deal.stage).label, formatMoney(deal.amount, deal.currency)]
            .filter(Boolean)
            .join(" · "),
          icon: company ? <CompanyLogo company={company} size="xs" /> : undefined,
        }
      : null;
  };

  const items = ids.flatMap((id) => {
    const item = itemFor(id);

    return item ? [item] : [];
  });

  if (items.length === 0) return null;

  return (
    <RecordList
      items={items}
      label={LIST_LABELS[kind]}
      onOpen={(id) => void openRecord(kind, id)}
    />
  );
}

/**
 * A record named in a sentence, a table cell or a step, with its logo or avatar when it is synced.
 * Without a label it takes the synced record's name, or `fallback` until the record syncs.
 * `mark={false}` leaves the logo out, for a step whose record the reply shows again.
 */
export function MentionChip({
  kind,
  label,
  id,
  fallback,
  mark = true,
}: {
  kind: RecordKind;
  label?: string | undefined;
  id: string;
  fallback?: string | undefined;
  mark?: boolean;
}) {
  const openRecord = useOpenRecord();
  const companies = useCompanies();
  const contacts = useContacts();
  const deals = useDeals();

  const deal = kind === "deal" ? deals.find((entry) => entry.id === id) : undefined;
  const companyId = kind === "company" ? id : deal?.company_id;
  const company = companyId ? companies.find((entry) => entry.id === companyId) : undefined;
  const contact = kind === "contact" ? contacts.find((entry) => entry.id === id) : undefined;

  const syncedName =
    kind === "company"
      ? company?.name
      : kind === "deal"
        ? deal?.name
        : contact && contactName(contact);

  const icon = !mark ? undefined : contact ? (
    <ContactAvatar contact={contact} size="xs" />
  ) : company ? (
    <CompanyLogo company={company} size="xs" />
  ) : undefined;

  const text = label ?? syncedName ?? fallback;

  if (!text) return null;

  return <RecordChip icon={icon} label={text} onOpen={() => void openRecord(kind, id)} />;
}

const mention = (kind: RecordKind): ReactiveIslands[string] => ({
  inline: true,
  render: (data) =>
    Option.match(decodeMention(data), {
      onNone: () => null,
      onSome: (found) => <MentionChip id={found.record} kind={kind} label={found.label} />,
    }),
});

/**
 * Components a reply can embed (see the agent's instructions.md). Model output is untrusted: each
 * `render` decodes its data and returns null to show the source instead.
 */
export const replyIslands: ReactiveIslands = {
  records: {
    pending: { className: "my-4 h-10 rounded-lg border", label: "Loading records" },
    render: (data) =>
      Option.match(decodeRecords(data), {
        onNone: () => null,
        onSome: (records) => <RecordsList ids={records.ids} kind={records.kind} />,
      }),
  },
  company: mention("company"),
  contact: mention("contact"),
  deal: mention("deal"),
};

const NO_RECORDS: readonly MentionableRecord[] = [];

/**
 * An agent reply with its components, tidied first (`tidyReply`). `touched` are the records the
 * turn's tool calls touched (`turnRecords`); the reply's names for them open them.
 */
export function ReplyResponse({
  text,
  streaming,
  touched = NO_RECORDS,
}: {
  text: string;
  streaming: boolean;
  touched?: readonly MentionableRecord[];
}) {
  const companies = useCompanies();

  return (
    <MessageResponse isAnimating={streaming} islands={replyIslands}>
      {tidyReply(text, companies, touched)}
    </MessageResponse>
  );
}
