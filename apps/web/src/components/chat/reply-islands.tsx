import { MessageResponse } from "@crm/ui/components/ai-elements/message";
import type { ReactiveIslands } from "@crm/ui/components/markdown";
import { RecordChip, RecordList } from "@crm/ui/patterns/record-list";
import { useLiveQuery } from "@tanstack/react-db";
import { useRouteContext } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { companiesCollection } from "../../lib/companies.ts";
import { useOpenRecord } from "../../lib/records.ts";
import { tidyReply } from "../../lib/reply-markdown.ts";

/** ```` ```island-records ```` : CRM records the reply lists, by id, in the reply's order. */
const RecordsIsland = Schema.Struct({
  kind: Schema.Literal("company"),
  ids: Schema.Array(Schema.String),
});

/** `:company[Capgo]{record="com_…"}`: a company named in a sentence. */
const CompanyMention = Schema.Struct({
  label: Schema.String,
  record: Schema.String,
});

const decodeRecords = Schema.decodeUnknownOption(RecordsIsland);
const decodeMention = Schema.decodeUnknownOption(CompanyMention);

function useCompanies() {
  const { session } = useRouteContext({ from: "/_authed/_workspace" });
  const collection = companiesCollection(session.session.activeOrganizationId ?? "");

  return useLiveQuery((q) => q.from({ company: collection })).data ?? [];
}

/** The listed companies that exist, from the synced copy; each row opens its sheet. */
function CompanyList({ ids }: { ids: readonly string[] }) {
  const companies = useCompanies();
  const openRecord = useOpenRecord();
  const byId = new Map(companies.map((company) => [company.id, company]));

  const items = ids.flatMap((id) => {
    const company = byId.get(id);

    return company ? [{ id, title: company.name, meta: company.domain }] : [];
  });

  if (items.length === 0) return null;

  return (
    <RecordList label="Companies" items={items} onOpen={(id) => void openRecord("company", id)} />
  );
}

function CompanyChip({ label, id }: { label: string; id: string }) {
  const openRecord = useOpenRecord();

  return <RecordChip label={label} onOpen={() => void openRecord("company", id)} />;
}

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
        onSome: (records) => <CompanyList ids={records.ids} />,
      }),
  },
  company: {
    inline: true,
    render: (data) =>
      Option.match(decodeMention(data), {
        onNone: () => null,
        onSome: (mention) => <CompanyChip label={mention.label} id={mention.record} />,
      }),
  },
};

/** An agent reply with its components, tidied first (`tidyReply`). */
export function ReplyResponse({ text, streaming }: { text: string; streaming: boolean }) {
  const companies = useCompanies();

  return (
    <MessageResponse isAnimating={streaming} islands={replyIslands}>
      {tidyReply(text, companies)}
    </MessageResponse>
  );
}
