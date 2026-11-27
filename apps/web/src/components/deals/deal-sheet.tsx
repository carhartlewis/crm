import {
  CURRENCIES,
  DEAL_CLOSED_REASON_FIELD,
  DEAL_FIELDS,
  type FieldSpec,
  formatMoney,
  isLosingStage,
  isOpenStage,
  stageSteps,
} from "@crm/core/records";
import {
  EntityHeader,
  type EntityMenuItem,
  EntitySection,
  EntitySheet,
  EntityStats,
} from "@crm/ui/patterns/entity-sheet";
import { useRecordSheetParams } from "@crm/ui/patterns/record-sheet/use-record-sheet-params";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOpenCreate } from "../../lib/create-sheet.ts";
import {
  type Deal,
  type DealContact,
  dealContactKey,
  dealContactsCollection,
  dealsCollection,
} from "../../lib/deals.ts";
import { calendarDate, momentDate, plural, relativeTime } from "../../lib/record-format.ts";
import { RECORD_TABS, useOpenRecord } from "../../lib/records.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { CustomFieldRows, FieldsSettingsLink } from "../fields/custom-field-rows.tsx";
import { ConfirmDeleteDialog } from "../records/confirm-delete-dialog.tsx";
import { ActivityFeed } from "../records/activity-feed.tsx";
import { RecordAgentTab, useRecordChat } from "../records/agent-tab.tsx";
import { syncActivityPrompt } from "../../lib/record-agent.ts";
import {
  ChoiceDetail,
  DateDetail,
  DetailList,
  DetailRow,
  ProseDetail,
  SearchDetail,
  StaticDetail,
  TextDetail,
} from "../records/detail-fields.tsx";
import { CompanyLogo, MemberAvatar } from "../records/record-visuals.tsx";
import { AddContactRow, ContactsList, ListTab } from "../records/related-lists.tsx";
import { type StageChange, StageMenu } from "../records/stage-menu.tsx";
import {
  byId,
  useCompanies,
  useContacts,
  useDealContacts,
  useDeals,
  useMembers,
} from "../records/use-crm.ts";

const spec = (column: string): FieldSpec =>
  DEAL_FIELDS.find((field) => field.column === column) ?? DEAL_FIELDS[0];

/** The pipeline as steps: done stages filled, the current one bold, the rest muted. */
function StageStepper({
  stage,
  onChange,
}: {
  stage: string;
  onChange: (change: StageChange) => void;
}) {
  const steps = stageSteps(stage);
  const index = steps.findIndex((step) => step.id === stage);

  return (
    <ol
      className="grid min-w-0 gap-1"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, position) => {
        const reached = position <= index;
        const lost = !isOpenStage(step.id) && isLosingStage(step.id);

        return (
          <li className="min-w-0" key={step.id}>
            <button
              aria-current={step.id === stage ? "step" : undefined}
              className="flex w-full min-w-0 border-t-2 border-border pt-2 text-left text-muted-foreground leading-4 outline-none transition-colors select-none aria-[current=step]:font-medium data-[reached]:border-foreground data-[reached]:text-foreground data-[lost]:border-destructive pointer-fine:enabled:hover:border-muted-foreground focus-visible:underline"
              data-lost={reached && lost ? true : undefined}
              data-reached={reached ? true : undefined}
              // A losing stage asks for its reason through the header's stage menu.
              disabled={lost || step.id === stage}
              onClick={() => onChange({ stage: step.id })}
              type="button"
            >
              <span className="truncate">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A deal's sheet (`?deal=<id>`), mounted once in the shell. Synced, so it renders with no request;
 * stage changes and edits save optimistically, and the API logs each stage change.
 */
export default function DealSheet({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const record = useRecordSheetParams({ recordKey: "deal", tabs: RECORD_TABS.deal });
  const { deals, loading } = useDeals(workspaceId);
  const { companies } = useCompanies(workspaceId);
  const { contacts } = useContacts(workspaceId);
  const links = useDealContacts(workspaceId);
  const { members, memberOf, nameOf } = useMembers(userId, workspaceId);
  const openRecord = useOpenRecord();
  const openCreate = useOpenCreate();

  const current = deals.find((row) => row.id === record.id);
  const owner = memberOf(current?.owner_id);

  // The Activity tab's sync starts an agent conversation in the Agent tab (ADR 0024).
  const agent = useRecordChat({ kind: "deal", recordId: record.id ?? "", userId, workspaceId });
  const open = record.id !== null;
  const company = current ? byId(companies).get(current.company_id) : undefined;
  const contactsById = byId(contacts);
  const dealLinks = current ? links.filter((link) => link.deal_id === current.id) : [];

  const onIt = dealLinks.flatMap((link) => {
    const contact = contactsById.get(link.contact_id);

    return contact ? [contact] : [];
  });

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Deal> }) =>
      saveRecord(dealsCollection(workspaceId), id, patch),
    onError: (error) => toast.error(error.message),
  });

  const link = useMutation({
    mutationFn: async (row: DealContact) => {
      await dealContactsCollection(workspaceId).insert(row).when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const setRole = useMutation({
    mutationFn: async ({ key, role }: { key: string; role: string | null }) => {
      await dealContactsCollection(workspaceId)
        .update(key, (draft) => {
          draft.role = role;
        })
        .when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const unlink = useMutation({
    mutationFn: async (key: string) => {
      await dealContactsCollection(workspaceId).delete(key).when("settled");
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecords(dealsCollection(workspaceId), [id]),
    onSuccess: () => {
      void record.close();
      toast.success("Deal deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const set = (patch: Partial<Deal>) => current && save.mutate({ id: current.id, patch });

  const stageChange = (change: StageChange) =>
    set({
      stage: change.stage,
      closed_reason: change.closed_reason ?? null,
      stage_changed_at: new Date().toISOString(),
    });

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

  return (
    <EntitySheet
      header={
        current ? (
          <>
            <EntityHeader
              actions={<StageMenu onChange={stageChange} stage={current.stage} />}
              leading={company ? <CompanyLogo company={company} size="default" /> : null}
              menu={menu}
              status={current.archived_at ? "Archived" : null}
              title={current.name}
            />
            <ConfirmDeleteDialog
              ids={confirmDelete ? [current.id] : null}
              kind="deal"
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
      label="Deal"
      loading={open && !current && loading}
      onClose={() => void record.close()}
      onTabChange={(tab) => void record.setTab(tab)}
      open={open}
      stats={
        current ? (
          <EntityStats
            stats={[
              { label: "Amount", value: formatMoney(current.amount, current.currency) ?? "—" },
              { label: "Expected close", value: calendarDate(current.expected_close_date) ?? "—" },
              { label: "In stage", value: relativeTime(current.stage_changed_at) ?? "—" },
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
            <>
              <EntitySection label="Stage">
                <StageStepper onChange={stageChange} stage={current.stage} />
              </EntitySection>
              <EntitySection action={<FieldsSettingsLink entity="deal" />} label="Details">
                <DetailList columns={2}>
                  <DetailRow label="Name">
                    <TextDetail
                      onSave={(value) => value && set({ name: value })}
                      spec={spec("name")}
                      value={current.name}
                    />
                  </DetailRow>
                  <DetailRow label="Amount">
                    <TextDetail
                      display={formatMoney(current.amount, current.currency)}
                      onSave={(value) => set({ amount: value })}
                      spec={spec("amount")}
                      value={current.amount}
                    />
                  </DetailRow>
                  <DetailRow label="Currency">
                    <ChoiceDetail
                      label="Currency"
                      onSave={(value) => value && set({ currency: value })}
                      options={CURRENCIES.map((currency) => ({
                        value: currency.code,
                        label: `${currency.code} · ${currency.name}`,
                      }))}
                      value={current.currency}
                    />
                  </DetailRow>
                  <DetailRow label="Close date">
                    <DateDetail
                      display={calendarDate(current.expected_close_date)}
                      label="Close date"
                      onSave={(value) => set({ expected_close_date: value })}
                      value={current.expected_close_date}
                    />
                  </DetailRow>
                  <DetailRow label="Company">
                    <SearchDetail
                      label="Company"
                      onSave={(value) => value && set({ company_id: value })}
                      options={companies
                        .filter((entry) => !entry.archived_at)
                        .map((entry) => ({
                          value: entry.id,
                          label: entry.name,
                          mark: <CompanyLogo company={entry} size="xs" />,
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
                        mark: <MemberAvatar member={member} size="xs" />,
                      }))}
                      value={current.owner_id}
                    />
                  </DetailRow>
                  <CustomFieldRows
                    entity="deal"
                    recordId={current.id}
                    userId={userId}
                    workspaceId={workspaceId}
                  />
                </DetailList>
              </EntitySection>
              <EntitySection label="Description">
                <ProseDetail
                  onSave={(value) => set({ description: value })}
                  placeholder="Where does this deal stand? Who decides, and what's in the way?"
                  spec={spec("description")}
                  value={current.description}
                />
              </EntitySection>
              <EntitySection label="Where it stands">
                <DetailList columns={2}>
                  <DetailRow label="Opened">
                    <StaticDetail>{momentDate(current.created_at)}</StaticDetail>
                  </DetailRow>
                  <DetailRow label="In stage since">
                    <StaticDetail>{momentDate(current.stage_changed_at)}</StaticDetail>
                  </DetailRow>
                  {current.closed_at ? (
                    <DetailRow label="Closed">
                      <StaticDetail>{momentDate(current.closed_at)}</StaticDetail>
                    </DetailRow>
                  ) : null}
                  {isLosingStage(current.stage) ? (
                    <DetailRow label="Reason">
                      <TextDetail
                        onSave={(value) => set({ closed_reason: value })}
                        spec={DEAL_CLOSED_REASON_FIELD}
                        value={current.closed_reason}
                      />
                    </DetailRow>
                  ) : null}
                  <DetailRow label="On it">
                    <StaticDetail>
                      {onIt.length
                        ? onIt
                            .map((contact) => {
                              const role = dealLinks.find(
                                (entry) => entry.contact_id === contact.id,
                              )?.role;

                              return `${contact.first_name}${role ? ` (${role})` : contact.title ? ` (${contact.title})` : ""}`;
                            })
                            .join(", ")
                        : null}
                    </StaticDetail>
                  </DetailRow>
                </DetailList>
              </EntitySection>
            </>
          ) : null,
        },
        {
          id: "contacts",
          label: "Contacts",
          count: onIt.length,
          content: current ? (
            <ListTab
              action={
                <AddContactRow
                  // People at the deal's company first, then everyone else.
                  contacts={contacts
                    .filter((contact) => !contact.archived_at && !onIt.includes(contact))
                    .toSorted(
                      (left, right) =>
                        Number(right.company_id === current.company_id) -
                        Number(left.company_id === current.company_id),
                    )}
                  onCreate={() => openCreate("contact", `company:${current.company_id}`)}
                  onPick={(contact) =>
                    link.mutate({
                      deal_id: current.id,
                      contact_id: contact.id,
                      workspace_id: workspaceId,
                      role: null,
                      created_at: new Date().toISOString(),
                    })
                  }
                />
              }
              summary={plural(onIt.length, "contact")}
            >
              <ContactsList
                contacts={onIt}
                onOpen={(id) => openRecord("contact", id)}
                onRemove={(contactId) =>
                  unlink.mutate(dealContactKey({ deal_id: current.id, contact_id: contactId }))
                }
                ownerOf={memberOf}
                role={{
                  of: (contactId) =>
                    dealLinks.find((entry) => entry.contact_id === contactId)?.role ?? null,
                  onSave: (contactId, role) =>
                    setRole.mutate({
                      key: dealContactKey({ deal_id: current.id, contact_id: contactId }),
                      role,
                    }),
                }}
              />
            </ListTab>
          ) : null,
        },
        {
          id: "activity",
          label: "Activity",
          content: current ? (
            <ActivityFeed
              dealName={() => null}
              nameOf={nameOf}
              onSync={() => {
                agent.ask(syncActivityPrompt("deal", current.name));
                void record.setTab("agent");
              }}
              syncing={agent.start.isPending}
              target={{ dealId: current.id }}
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
              kind="deal"
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
