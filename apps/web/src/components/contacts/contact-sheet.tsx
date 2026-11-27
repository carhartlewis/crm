import email16 from "@carbon/icons/es/email/16.js";
import renew16 from "@carbon/icons/es/renew/16.js";
import { CONTACT_FIELDS, contactName, type FieldSpec, relationship } from "@crm/core/records";
import { carbonIcon } from "@crm/ui/components/icon";
import { StatusDot } from "@crm/ui/components/status-dot";
import { RailLink } from "@crm/ui/patterns/record-sheet/record-rail";
import {
  EntityAction,
  EntityHeader,
  type EntityMenuItem,
  EntitySection,
  EntitySheet,
  EntityStats,
} from "@crm/ui/patterns/entity-sheet";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type Company, companiesCollection } from "../../lib/companies.ts";
import { type Contact, contactsCollection } from "../../lib/contacts.ts";
import { useOpenCreate } from "../../lib/create-sheet.ts";
import { type Deal, dealsCollection } from "../../lib/deals.ts";
import { momentDate, plural, relativeTime } from "../../lib/record-format.ts";
import { useOpenRecord, useRecordSheet } from "../../lib/records.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { CustomFieldRows, FieldsSettingsLink } from "../fields/custom-field-rows.tsx";
import { ConfirmDeleteDialog } from "../records/confirm-delete-dialog.tsx";
import { ActivityFeed } from "../records/activity-feed.tsx";
import { RecordAgentTab, useRecordChat } from "../records/agent-tab.tsx";
import { enrichContactPrompt, syncActivityPrompt } from "../../lib/record-agent.ts";
import {
  ContactBackground,
  FactSuggestion,
  useContactIntel,
  useDecideFact,
} from "./contact-intel.tsx";
import {
  ChoiceDetail,
  DetailList,
  DetailRow,
  SearchDetail,
  StaticDetail,
  TextDetail,
} from "../records/detail-fields.tsx";
import { CompanyLogo, ContactAvatar, MemberAvatar, MARK_SIZE } from "../records/record-visuals.tsx";
import { AddButton, DealsList, ListTab } from "../records/related-lists.tsx";
import { WebsiteActivity } from "../records/website-activity.tsx";
import {
  byId,
  useActivities,
  useCompanies,
  useContacts,
  useDealContacts,
  useDeals,
  useMembers,
} from "../records/use-crm.ts";

const EmailIcon = carbonIcon(email16);
const RenewIcon = carbonIcon(renew16);

const spec = (column: string): FieldSpec =>
  CONTACT_FIELDS.find((field) => field.column === column) ?? CONTACT_FIELDS[0];

/** The columns that hold text, which `TextDetail` edits. */
type TextColumn = {
  [K in keyof Contact]: Contact[K] extends string | null ? K : never;
}[keyof Contact];

/**
 * A contact's sheet (`?sheet=contact:<id>`), mounted once in the shell. Synced, so it renders with no
 * request; every edit saves optimistically.
 */
export default function ContactSheet({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const record = useRecordSheet("contact");
  const { contacts, loading } = useContacts(workspaceId);
  const { companies } = useCompanies(workspaceId);
  const { deals } = useDeals(workspaceId);
  const links = useDealContacts(workspaceId);
  const activities = useActivities(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);
  const openRecord = useOpenRecord();
  const openCreate = useOpenCreate();

  const current = contacts.find((row) => row.id === record.id);
  const owner = memberOf(current?.owner_id);
  const open = record.id !== null;
  const companiesById = byId(companies);
  const company = current?.company_id ? companiesById.get(current.company_id) : undefined;
  const isPrimary = company !== undefined && company.primary_contact_id === current?.id;

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Contact> }) =>
      saveRecord(contactsCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const saveCompany = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Company> }) =>
      saveRecord(companiesCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const saveDeal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Deal> }) =>
      saveRecord(dealsCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecords(contactsCollection(workspaceId), [id]),
    onSuccess: () => {
      void record.close();
      toast.success("Contact deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const set = (patch: Partial<Contact>) => current && save.mutate({ id: current.id, patch });

  // Re-enrich and the Activity tab's sync start an agent conversation in the Agent tab (ADR 0024).
  const agent = useRecordChat({
    kind: "contact",
    recordId: record.id ?? "",
    userId,
    workspaceId,
  });

  const askAgent = (prompt: { title: string; text: string }) => {
    agent.ask(prompt);
    void record.setTab("agent");
  };

  const intel = useContactIntel(workspaceId, current?.id ?? null);
  const decide = useDecideFact(workspaceId);

  const myLinks = current ? links.filter((link) => link.contact_id === current.id) : [];
  const dealsById = byId(deals);

  const myDeals = myLinks.flatMap((link) => {
    const deal = dealsById.get(link.deal_id);

    return deal && !deal.archived_at ? [deal] : [];
  });

  // Emails and meetings the agent logged from connected mail and calendar, plus logged ones.
  const known = current
    ? relationship(activities, current.id)
    : { emails: 0, lastEmailAt: null, meetings: 0, nextMeeting: null };

  const colleagues = current?.company_id
    ? contacts.filter(
        (contact) =>
          contact.company_id === current.company_id &&
          contact.id !== current.id &&
          !contact.archived_at,
      )
    : [];

  const text = (column: TextColumn) => {
    if (!current) return null;

    const editor = (
      <TextDetail
        onSave={(value) => set({ [column]: value })}
        spec={spec(column)}
        value={current[column]}
      />
    );

    // The agent's open suggestion for this field, under its value (ADR 0024).
    const suggestion = intel.suggestions.get(column);

    return (
      <DetailRow label={spec(column).label}>
        {suggestion && suggestion.value !== current[column] ? (
          <div className="flex min-w-0 flex-1 flex-col">
            {editor}
            <FactSuggestion
              fact={suggestion}
              onDecide={(status) => decide.mutate({ fact: suggestion, status })}
              pending={decide.isPending}
            />
          </div>
        ) : (
          editor
        )}
      </DetailRow>
    );
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const menu: EntityMenuItem[] = current
    ? [
        ...(company && !isPrimary
          ? [
              {
                id: "primary",
                label: `Make primary at ${company.name}`,
                onSelect: () =>
                  saveCompany.mutate({ id: company.id, patch: { primary_contact_id: current.id } }),
              },
            ]
          : []),
        current.archived_at
          ? { id: "restore", label: "Restore", onSelect: () => set({ archived_at: null }) }
          : {
              id: "archive",
              label: "Archive",
              onSelect: () => set({ archived_at: new Date().toISOString() }),
            },
        {
          id: "delete",
          label: "Delete",
          destructive: true,
          onSelect: () => setConfirmDelete(true),
        },
      ]
    : [];

  const socials = current
    ? [
        ["LinkedIn", current.linkedin_url],
        ["X", current.twitter_url],
        ["GitHub", current.github_url],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    : [];

  return (
    <EntitySheet
      header={
        current ? (
          <>
            <EntityHeader
              actions={
                <>
                  <EntityAction
                    loading={agent.start.isPending}
                    onClick={() => askAgent(enrichContactPrompt(contactName(current)))}
                  >
                    <RenewIcon />
                    Re-enrich
                  </EntityAction>
                  {current.email ? (
                    <EntityAction onClick={() => window.open(`mailto:${current.email}`, "_self")}>
                      <EmailIcon />
                      Email
                    </EntityAction>
                  ) : null}
                </>
              }
              leading={<ContactAvatar contact={current} size="lg" />}
              menu={menu}
              status={
                isPrimary ? (
                  <>
                    <StatusDot tone="success" />
                    Primary contact
                  </>
                ) : current.archived_at ? (
                  "Archived"
                ) : current.enrichment_status === "running" ? (
                  "Researching"
                ) : null
              }
              title={contactName(current)}
            />
            <ConfirmDeleteDialog
              ids={confirmDelete ? [current.id] : null}
              kind="contact"
              name={contactName(current)}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                setConfirmDelete(false);
                remove.mutate(current.id);
              }}
            />
          </>
        ) : null
      }
      label="Contact"
      loading={open && !current && loading}
      onClose={() => void record.close()}
      onTabChange={(tab) => void record.setTab(tab)}
      open={open}
      stats={
        current ? (
          <EntityStats
            stats={[
              {
                label: "Company",
                value: company ? (
                  <button
                    className="flex min-w-0 items-center gap-2 outline-none pointer-fine:hover:underline focus-visible:underline"
                    onClick={() => openRecord("company", company.id)}
                    type="button"
                  >
                    <CompanyLogo company={company} size={MARK_SIZE} />
                    <span className="truncate">{company.name}</span>
                  </button>
                ) : (
                  "—"
                ),
              },
              {
                label: "Email",
                value: current.email ? (
                  <a
                    className="truncate pointer-fine:hover:underline"
                    href={`mailto:${current.email}`}
                  >
                    {current.email}
                  </a>
                ) : (
                  "—"
                ),
              },
              {
                label: "Phone",
                value: current.phone ? (
                  <a
                    className="truncate pointer-fine:hover:underline"
                    href={`tel:${current.phone}`}
                  >
                    {current.phone}
                  </a>
                ) : (
                  "—"
                ),
              },
              {
                label: "Owner",
                value: owner ? (
                  <>
                    <MemberAvatar member={owner} size={MARK_SIZE} />
                    <span className="truncate">{owner.name}</span>
                  </>
                ) : (
                  "Unassigned"
                ),
              },
            ]}
          />
        ) : null
      }
      tab={record.tab}
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: current ? (
            <>
              <EntitySection action={<FieldsSettingsLink entity="contact" />} label="Details">
                <DetailList columns={2}>
                  {text("first_name")}
                  {text("last_name")}
                  {text("title")}
                  {text("email")}
                  {text("phone")}
                  {text("linkedin_url")}
                  {text("twitter_url")}
                  {text("github_url")}
                  {text("seniority")}
                  {text("function")}
                  <DetailRow label="Company">
                    <SearchDetail
                      label="Company"
                      none="No company"
                      onSave={(value) => set({ company_id: value })}
                      options={companies
                        .filter((entry) => !entry.archived_at)
                        .map((entry) => ({
                          value: entry.id,
                          label: entry.name,
                          mark: <CompanyLogo company={entry} size={MARK_SIZE} />,
                        }))}
                      placeholder="Search companies…"
                      value={current.company_id}
                    />
                  </DetailRow>
                  <DetailRow label="Owner">
                    <ChoiceDetail
                      label="Owner"
                      none="Unassigned"
                      onSave={(value) => set({ owner_id: value })}
                      options={members.map((member) => ({
                        value: member.id,
                        label: member.name,
                        mark: <MemberAvatar member={member} size={MARK_SIZE} />,
                      }))}
                      value={current.owner_id}
                    />
                  </DetailRow>
                  <CustomFieldRows
                    entity="contact"
                    recordId={current.id}
                    userId={userId}
                    workspaceId={workspaceId}
                  />
                </DetailList>
              </EntitySection>
              {intel.brief ? <ContactBackground brief={intel.brief} /> : null}
              <EntitySection label="We know them">
                <DetailList columns={2}>
                  <DetailRow label="Emails">
                    <StaticDetail muted>
                      {known.emails
                        ? `${known.emails} · last reply ${relativeTime(known.lastEmailAt)}`
                        : "None logged"}
                    </StaticDetail>
                  </DetailRow>
                  <DetailRow label="Meetings">
                    <StaticDetail>{String(known.meetings)}</StaticDetail>
                  </DetailRow>
                  <DetailRow label="Next meeting">
                    <StaticDetail>
                      {known.nextMeeting
                        ? `${momentDate(known.nextMeeting.at)} · ${known.nextMeeting.subject ?? "Meeting"}`
                        : null}
                    </StaticDetail>
                  </DetailRow>
                  <DetailRow label="Colleagues">
                    {colleagues.length ? (
                      <span className="flex min-w-0 flex-wrap gap-x-1 px-2 py-1 text-foreground leading-5">
                        {colleagues.slice(0, 4).map((colleague, index) => (
                          <button
                            className="truncate outline-none pointer-fine:hover:underline focus-visible:underline"
                            key={colleague.id}
                            onClick={() => openRecord("contact", colleague.id)}
                            type="button"
                          >
                            {contactName(colleague)}
                            {index < Math.min(colleagues.length, 4) - 1 ? "," : ""}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <StaticDetail>{null}</StaticDetail>
                    )}
                  </DetailRow>
                </DetailList>
              </EntitySection>
              <WebsiteActivity
                id={current.id}
                kind="contact"
                userId={userId}
                workspaceId={workspaceId}
              />
              {socials.length > 0 ? (
                <EntitySection label="Links">
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {socials.map(([label, href]) => (
                      <RailLink href={href} key={label}>
                        {label}
                      </RailLink>
                    ))}
                  </div>
                </EntitySection>
              ) : null}
            </>
          ) : null,
        },
        {
          id: "deals",
          label: "Deals",
          count: myDeals.length,
          content: current ? (
            <ListTab
              action={
                <AddButton
                  label="Add deal"
                  onClick={() => openCreate("deal", `contact:${current.id}`)}
                />
              }
              summary={plural(myDeals.length, "deal")}
            >
              <DealsList
                deals={myDeals}
                onOpen={(id) => openRecord("deal", id)}
                onStage={(id, change) => saveDeal.mutate({ id, patch: change })}
                ownerOf={memberOf}
                roleOf={(dealId) => myLinks.find((link) => link.deal_id === dealId)?.role ?? null}
              />
            </ListTab>
          ) : null,
        },
        {
          id: "activity",
          label: "Activity",
          content: current ? (
            <ActivityFeed
              dealName={(id) => dealsById.get(id)?.name ?? null}
              nameOf={nameOf}
              onSync={() => askAgent(syncActivityPrompt("contact", contactName(current)))}
              syncing={agent.start.isPending}
              target={{ contactId: current.id }}
              userId={userId}
              workspaceId={workspaceId}
            />
          ) : null,
        },
        {
          id: "agent",
          label: "Agent",
          content: current ? (
            <RecordAgentTab
              key={current.id}
              kind="contact"
              recordId={current.id}
              userId={userId}
              workspaceId={workspaceId}
            />
          ) : null,
        },
      ]}
    />
  );
}
