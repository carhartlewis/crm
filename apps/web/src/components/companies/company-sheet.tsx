import renew16 from "@carbon/icons/es/renew/16.js";
import search16 from "@carbon/icons/es/search/16.js";
import { COMPANY_FIELDS, type FieldSpec, formatMoney, pipelineSummary } from "@crm/core/records";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  EntityAction,
  EntityColumns,
  EntityHeader,
  type EntityMenuItem,
  EntitySection,
  EntitySheet,
  EntityStats,
} from "@crm/ui/patterns/entity-sheet";
import { RailLink } from "@crm/ui/patterns/record-sheet/record-rail";
import { useRecordSheetParams } from "@crm/ui/patterns/record-sheet/use-record-sheet-params";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type Company, companiesCollection, enrichCompanyMutation } from "../../lib/companies.ts";
import { type Contact, contactsCollection } from "../../lib/contacts.ts";
import { type Deal, dealsCollection } from "../../lib/deals.ts";
import { useOpenCreate } from "../../lib/create-sheet.ts";
import { notCountedNote, useReportingCurrency } from "../../lib/money.ts";
import { calendarDate, plural } from "../../lib/record-format.ts";
import { RECORD_TABS, useOpenRecord } from "../../lib/records.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { CustomFieldRows, FieldsSettingsLink } from "../fields/custom-field-rows.tsx";
import { ConfirmDeleteDialog } from "../records/confirm-delete-dialog.tsx";
import { ActivityFeed } from "../records/activity-feed.tsx";
import { RecordAgentTab, useRecordChat } from "../records/agent-tab.tsx";
import { researchCompanyPrompt, syncActivityPrompt } from "../../lib/record-agent.ts";
import {
  ChoiceDetail,
  DetailList,
  DetailRow,
  ProseDetail,
  TextDetail,
} from "../records/detail-fields.tsx";
import { CompanyLogo, MemberAvatar } from "../records/record-visuals.tsx";
import {
  AddButton,
  AddContactRow,
  ContactsList,
  DealsList,
  ListTab,
} from "../records/related-lists.tsx";
import { WebsiteActivity } from "../records/website-activity.tsx";
import { byId, useCompanies, useContacts, useDeals, useMembers } from "../records/use-crm.ts";
import { CompanyKnowledge } from "./company-knowledge.tsx";

const RenewIcon = carbonIcon(renew16);
const ResearchIcon = carbonIcon(search16);

const spec = (column: string): FieldSpec =>
  COMPANY_FIELDS.find((field) => field.column === column) ?? COMPANY_FIELDS[0];

/** The columns that hold text, which `TextDetail` edits. */
type TextColumn = {
  [K in keyof Company]: Company[K] extends string | null ? K : never;
}[keyof Company];

export interface CompanySheetProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * A company's sheet (`?company=<id>`), mounted once in the shell so it opens over any page: from
 * a table, ⌘K or a chat. Everything it shows is synced, so it renders with no request, and every
 * edit saves optimistically.
 */
export default function CompanySheet({ userId, workspaceId }: CompanySheetProps) {
  const record = useRecordSheetParams({ recordKey: "company", tabs: RECORD_TABS.company });
  const { companies, loading } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const { deals } = useDeals(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);
  const reporting = useReportingCurrency(workspaceId);
  const openRecord = useOpenRecord();
  const openCreate = useOpenCreate();

  const current = companies.find((row) => row.id === record.id);
  const owner = memberOf(current?.owner_id);
  const open = record.id !== null;

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Company> }) =>
      saveRecord(companiesCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const saveContact = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Contact> }) =>
      saveRecord(contactsCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const saveDeal = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Deal> }) =>
      saveRecord(dealsCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecords(companiesCollection(workspaceId), [id]),
    onSuccess: () => {
      void record.close();
      toast.success("Company deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  // Research and the Activity tab's sync start an agent conversation in the Agent tab (ADR 0024).
  const agent = useRecordChat({
    kind: "company",
    recordId: record.id ?? "",
    userId,
    workspaceId,
  });

  const askAgent = (prompt: { title: string; text: string }) => {
    agent.ask(prompt);
    void record.setTab("agent");
  };

  const enrich = useMutation({
    ...enrichCompanyMutation,
    onSuccess: (queued) =>
      queued
        ? toast.success("Refreshing the logo and research")
        : toast.message("Add a domain first, so there is something to look up"),
    onError: (error) => toast.error(error.message),
  });

  const companyContacts = current
    ? contacts.filter((contact) => contact.company_id === current.id && !contact.archived_at)
    : [];

  const companyDeals = current
    ? deals
        .filter((deal) => deal.company_id === current.id && !deal.archived_at)
        .toSorted((left, right) => right.created_at.localeCompare(left.created_at))
    : [];

  const pipeline = pipelineSummary(companyDeals, reporting);
  const notCounted = notCountedNote(pipeline);
  const dealsById = byId(deals);

  const ownerOptions = members.map((member) => ({
    value: member.id,
    label: member.name,
    mark: <MemberAvatar member={member} size="xs" />,
  }));

  const set = (patch: Partial<Company>) => current && save.mutate({ id: current.id, patch });

  const text = (column: TextColumn) =>
    current ? (
      <DetailRow label={spec(column).label}>
        <TextDetail
          onSave={(value) => set({ [column]: value })}
          spec={spec(column)}
          value={current[column]}
        />
      </DetailRow>
    ) : null;

  const [confirmDelete, setConfirmDelete] = useState(false);

  const menu: EntityMenuItem[] = current
    ? [
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

  const links = current
    ? [
        // One field: the site is the domain's (a stored website wins, from research).
        ["Website", current.website ?? (current.domain ? `https://${current.domain}` : null)],
        ["LinkedIn", current.linkedin_url],
        ["X", current.twitter_url],
        ["GitHub", current.github_url],
        ["Pricing", current.pricing_url],
        ["Careers", current.careers_url],
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
                    disabled={!current.domain}
                    loading={enrich.isPending}
                    onClick={() => enrich.mutate(current.id)}
                  >
                    <RenewIcon />
                    Re-enrich
                  </EntityAction>
                  <EntityAction
                    loading={agent.start.isPending}
                    onClick={() => askAgent(researchCompanyPrompt(current.name))}
                  >
                    <ResearchIcon />
                    Research
                  </EntityAction>
                </>
              }
              leading={<CompanyLogo company={current} size="default" />}
              menu={menu}
              status={
                current.archived_at
                  ? "Archived"
                  : current.enrichment_status === "running"
                    ? "Researching"
                    : null
              }
              title={current.name}
            />
            <ConfirmDeleteDialog
              ids={confirmDelete ? [current.id] : null}
              impact={{
                deals: deals.filter((deal) => deal.company_id === current.id).length,
                contacts: contacts.filter((contact) => contact.company_id === current.id).length,
              }}
              kind="company"
              name={current.name}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                setConfirmDelete(false);
                remove.mutate(current.id);
              }}
            />
          </>
        ) : null
      }
      label="Company"
      loading={open && !current && loading}
      onClose={() => void record.close()}
      onTabChange={(tab) => void record.setTab(tab)}
      open={open}
      stats={
        current ? (
          <EntityStats
            stats={[
              {
                label: "Open pipeline",
                value: (
                  <>
                    {formatMoney(pipeline.total, reporting) ?? formatMoney(0, reporting)}
                    {notCounted ? (
                      <span className="truncate font-normal text-muted-foreground text-xs">
                        {notCounted}
                      </span>
                    ) : null}
                  </>
                ),
              },
              { label: "Open deals", value: String(pipeline.openCount) },
              { label: "Next close", value: calendarDate(pipeline.nextClose) ?? "—" },
              {
                label: "Owner",
                value: owner ? (
                  <>
                    <MemberAvatar member={owner} />
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
            <EntityColumns
              main={
                <>
                  <EntitySection label="About">
                    <ProseDetail
                      onSave={(value) => set({ description: value })}
                      quiet
                      placeholder="What does this company do? Re-enrich to research it, or write it here."
                      spec={spec("description")}
                      value={current.description}
                    />
                  </EntitySection>
                  <WebsiteActivity
                    id={current.id}
                    kind="company"
                    userId={userId}
                    workspaceId={workspaceId}
                  />
                  {links.length > 0 ? (
                    <EntitySection label="Links">
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        {links.map(([label, href]) => (
                          <RailLink href={href} key={label}>
                            {label}
                          </RailLink>
                        ))}
                      </div>
                    </EntitySection>
                  ) : null}
                </>
              }
              side={
                <EntitySection action={<FieldsSettingsLink entity="company" />} label="Details">
                  <DetailList>
                    {text("name")}
                    {text("domain")}
                    {text("phone")}
                    {text("email")}
                    {text("industry")}
                    {text("city")}
                    {text("country")}
                    <DetailRow label="Owner">
                      <ChoiceDetail
                        label="Owner"
                        none="Unassigned"
                        onSave={(value) => set({ owner_id: value })}
                        options={ownerOptions}
                        value={current.owner_id}
                      />
                    </DetailRow>
                    {text("linkedin_url")}
                    {text("twitter_url")}
                    {text("github_url")}
                    <CustomFieldRows
                      entity="company"
                      recordId={current.id}
                      userId={userId}
                      workspaceId={workspaceId}
                    />
                  </DetailList>
                </EntitySection>
              }
            />
          ) : null,
        },
        {
          id: "contacts",
          label: "Contacts",
          count: companyContacts.length,
          content: current ? (
            <ListTab
              action={
                <AddContactRow
                  contacts={contacts.filter(
                    (contact) => contact.company_id !== current.id && !contact.archived_at,
                  )}
                  onCreate={() => openCreate("contact", `company:${current.id}`)}
                  onPick={(contact) =>
                    saveContact.mutate({ id: contact.id, patch: { company_id: current.id } })
                  }
                />
              }
              summary={plural(companyContacts.length, "contact")}
            >
              <ContactsList
                contacts={companyContacts}
                onOpen={(id) => openRecord("contact", id)}
                onPrimary={(id) => set({ primary_contact_id: id })}
                ownerOf={memberOf}
                primaryId={current.primary_contact_id}
              />
            </ListTab>
          ) : null,
        },
        {
          id: "deals",
          label: "Deals",
          count: companyDeals.length,
          content: current ? (
            <ListTab
              action={
                <AddButton
                  label="Add deal"
                  onClick={() => openCreate("deal", `company:${current.id}`)}
                />
              }
              summary={plural(companyDeals.length, "deal")}
            >
              <DealsList
                deals={companyDeals}
                onOpen={(id) => openRecord("deal", id)}
                onStage={(id, change) => saveDeal.mutate({ id, patch: change })}
                ownerOf={memberOf}
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
              onSync={() => askAgent(syncActivityPrompt("company", current.name))}
              syncing={agent.start.isPending}
              target={{ companyId: current.id }}
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
              kind="company"
              recordId={current.id}
              userId={userId}
              workspaceId={workspaceId}
            />
          ) : null,
        },
        {
          id: "knowledge",
          label: "Knowledge",
          content: current ? (
            <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
              <CompanyKnowledge
                company={current}
                key={current.id}
                userId={userId}
                workspaceId={workspaceId}
              />
            </div>
          ) : null,
        },
      ]}
    />
  );
}
