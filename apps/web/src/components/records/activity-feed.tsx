import arrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import userMultiple16 from "@carbon/icons/es/user--multiple/16.js";
import chat16 from "@carbon/icons/es/chat/16.js";
import email16 from "@carbon/icons/es/email/16.js";
import phone16 from "@carbon/icons/es/phone/16.js";
import taskIcon16 from "@carbon/icons/es/task/16.js";
import trashCan16 from "@carbon/icons/es/trash-can/16.js";
import launch16 from "@carbon/icons/es/launch/16.js";
import renew16 from "@carbon/icons/es/renew/16.js";
import {
  activityMetaLine,
  dealStage,
  LOGGED_ACTIVITY_TYPES,
  type LoggedActivityType,
} from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import { DateTimePicker } from "@crm/ui/components/date-picker";
import { carbonIcon } from "@crm/ui/components/icon";
import { SelectField } from "@crm/ui/components/select-field";
import { StatusDot } from "@crm/ui/components/status-dot";
import { InputGroupTextarea } from "@crm/ui/components/input-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type Activity, activitiesCollection, newActivity } from "../../lib/activities.ts";
import { dayHeading, daysSince, isPast, timeOfDay } from "../../lib/record-format.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { useOpenRecord } from "../../lib/records.ts";
import { useActivities } from "./use-crm.ts";

const ICONS = {
  note: carbonIcon(chat16),
  call: carbonIcon(phone16),
  email: carbonIcon(email16),
  meeting: carbonIcon(userMultiple16),
  task: carbonIcon(taskIcon16),
  stage_change: carbonIcon(arrowRight16),
  enrichment: carbonIcon(arrowRight16),
} as const;

/** Whether a synced type has its own icon; a type this build doesn't know shows as a note. */
const hasIcon = (type: string): type is keyof typeof ICONS => Object.hasOwn(ICONS, type);

const TrashIcon = carbonIcon(trashCan16);
const LaunchIcon = carbonIcon(launch16);
const SyncIcon = carbonIcon(renew16);

const TYPE_LABELS: Record<LoggedActivityType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  task: "Task",
};

type Filter = "all" | "note" | "email" | "meeting" | "upcoming" | "done";

/** The record an activity feed belongs to. */
export interface ActivityTarget {
  readonly companyId?: string;
  readonly contactId?: string;
  readonly dealId?: string;
}

const belongs = (activity: Activity, target: ActivityTarget) =>
  (target.dealId !== undefined && activity.deal_id === target.dealId) ||
  (target.contactId !== undefined && activity.contact_id === target.contactId) ||
  (target.companyId !== undefined && activity.company_id === target.companyId);

const isOpenTask = (activity: Activity) => activity.type === "task" && !activity.completed_at;

/**
 * A record's activity: a composer to log a note, call, email, meeting or task, filters, open
 * tasks first, then everything else by day. Logged items show at once and sync to the team.
 */
export function ActivityFeed({
  workspaceId,
  userId,
  target,
  nameOf,
  dealName,
  onSync,
  syncing = false,
}: {
  workspaceId: string;
  userId: string;
  target: ActivityTarget;
  nameOf: (id: string | null) => string | null;
  /** A deal's name, to link activities logged on one. */
  dealName: (id: string) => string | null;
  /** Asks the agent to log this record's email and meetings (ADR 0024), in the Agent tab. */
  onSync?: () => void;
  syncing?: boolean;
}) {
  const collection = activitiesCollection(workspaceId);

  const all = useActivities(workspaceId)
    .filter((activity) => belongs(activity, target))
    .toSorted((left, right) => right.occurred_at.localeCompare(left.occurred_at));

  const [filter, setFilter] = useState<Filter>("all");
  const openRecord = useOpenRecord();

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Activity> }) =>
      saveRecord(collection, id, patch),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecords(collection, [id]),
    onError: (error) => toast.error(error.message),
  });

  const counts = {
    note: all.filter((activity) => activity.type === "note").length,
    email: all.filter((activity) => activity.type === "email").length,
    meeting: all.filter((activity) => activity.type === "meeting").length,
    upcoming: all.filter(isOpenTask).length,
  };

  const shown = all.filter((activity) => {
    if (filter === "all") return true;

    if (filter === "upcoming") return isOpenTask(activity);

    if (filter === "done") return activity.type === "task" && activity.completed_at !== null;

    return activity.type === filter;
  });

  const outstanding = filter === "all" || filter === "upcoming" ? shown.filter(isOpenTask) : [];
  const rest = shown.filter((activity) => !outstanding.includes(activity));
  const days = Map.groupBy(rest, (activity) => dayHeading(activity.occurred_at));

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "note", label: "Notes", count: counts.note },
    { id: "email", label: "Email", count: counts.email },
    { id: "meeting", label: "Meetings", count: counts.meeting },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
    { id: "done", label: "Done" },
  ];

  const row = (activity: Activity) => (
    <ActivityRow
      activity={activity}
      author={nameOf(activity.created_by_id)}
      dealName={activity.deal_id && !target.dealId ? dealName(activity.deal_id) : null}
      key={activity.id}
      onComplete={(done) =>
        save.mutate({
          id: activity.id,
          patch: { completed_at: done ? new Date().toISOString() : null },
        })
      }
      onOpenDeal={(id) => openRecord("deal", id)}
      onRemove={() => remove.mutate(activity.id)}
    />
  );

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 border-b px-5 py-4">
        <ActivityComposer
          onLog={async (draft) => {
            const logged = newActivity({
              workspaceId,
              userId,
              ...draft,
              companyId: target.companyId ?? null,
              contactId: target.contactId ?? null,
              dealId: target.dealId ?? null,
            });

            await collection.insert(logged).when("settled");
          }}
        />

        <div className="flex min-w-0 items-center justify-between gap-3">
          <div
            className="flex w-fit items-center overflow-hidden rounded-md select-none"
            role="tablist"
          >
            {filters.map((entry) => (
              <button
                aria-selected={filter === entry.id}
                className="flex h-7 items-center gap-1 px-2 font-medium text-muted-foreground outline-none aria-selected:bg-muted aria-selected:text-foreground pointer-fine:hover:text-foreground focus-visible:underline"
                key={entry.id}
                onClick={() => setFilter(entry.id)}
                role="tab"
                type="button"
              >
                {entry.label}
                {entry.count ? (
                  <span className="tabular-nums opacity-60">{entry.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          {onSync ? (
            <Button
              className="shrink-0"
              loading={syncing}
              onClick={onSync}
              size="sm"
              variant="ghost"
            >
              <SyncIcon />
              Sync email &amp; calendar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col px-5 pb-4">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            {filter === "all" ? "Nothing logged yet." : "Nothing here."}
          </p>
        ) : null}

        {outstanding.length > 0 ? (
          <section className="flex flex-col">
            <h4 className="pt-4 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider select-none">
              Outstanding
            </h4>
            {outstanding.map(row)}
          </section>
        ) : null}

        {[...days].map(([heading, items]) => (
          <section className="flex flex-col" key={heading}>
            <h4 className="pt-4 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider select-none">
              {heading}
            </h4>
            {items.map(row)}
          </section>
        ))}
      </div>
    </div>
  );
}

interface Draft {
  readonly type: LoggedActivityType;
  readonly subject: string | null;
  readonly body: string | null;
  readonly dueAt: string | null;
}

function ActivityComposer({ onLog }: { onLog: (draft: Draft) => Promise<void> }) {
  const [type, setType] = useState<LoggedActivityType>("note");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");

  const log = useMutation({
    mutationFn: onLog,
    onSuccess: () => {
      setText("");
      setDue("");
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    const trimmed = text.trim();

    if (!trimmed) return;

    // A task or email reads best as a title; a note or call keeps everything as its body.
    const [first = "", ...more] = trimmed.split("\n");
    const titled = type === "task" || type === "email" || type === "meeting";

    log.mutate({
      type,
      subject: titled ? first.trim() : null,
      body: titled ? more.join("\n").trim() || null : trimmed,
      dueAt: type === "task" && due ? new Date(due).toISOString() : null,
    });
  };

  return (
    <form
      className="flex flex-col rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* The form draws the border and focus ring, so the field itself is borderless. */}
      <InputGroupTextarea
        aria-label="Log activity"
        className="min-h-9"
        density="compact"
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="Log a note, call, email, meeting or task…"
        value={text}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-input px-2.5 py-2">
        <div className="flex items-center overflow-hidden rounded-md select-none">
          {LOGGED_ACTIVITY_TYPES.map((option) => {
            const Icon = ICONS[option];

            return (
              <button
                aria-pressed={type === option}
                className="flex h-7 items-center gap-1 pr-2 pl-1.5 font-medium text-muted-foreground outline-none aria-pressed:bg-muted aria-pressed:text-foreground pointer-fine:hover:text-foreground focus-visible:underline"
                key={option}
                onClick={() => setType(option)}
                type="button"
              >
                <Icon className="size-3.5" />
                {TYPE_LABELS[option]}
              </button>
            );
          })}
        </div>
        {type === "task" ? (
          <DateTimePicker
            aria-label="Due"
            onChange={setDue}
            render={<SelectField className="h-7 w-auto min-w-40" placeholder="Due date" />}
            value={due}
          />
        ) : null}
        {text.trim() ? (
          <Button className="ml-auto" loading={log.isPending} size="sm" type="submit">
            Log {TYPE_LABELS[type].toLowerCase()}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ActivityRow({
  activity,
  author,
  dealName,
  onComplete,
  onOpenDeal,
  onRemove,
}: {
  activity: Activity;
  author: string | null;
  dealName: string | null;
  onComplete: (done: boolean) => void;
  onOpenDeal: (id: string) => void;
  onRemove: () => void;
}) {
  const Icon = hasIcon(activity.type) ? ICONS[activity.type] : ICONS.note;
  const isTask = activity.type === "task";

  const overdue =
    isTask && !activity.completed_at && activity.due_at !== null && isPast(activity.due_at);

  const title =
    activity.type === "stage_change" && activity.meta?.from && activity.meta.to
      ? `${dealStage(activity.meta.from).label} → ${dealStage(activity.meta.to).label}`
      : activity.subject;

  // "12 messages", "45 min · 4 attendees": from the thread or event the agent logged.
  const synced = activityMetaLine(activity.type, activity.meta);

  const details = [
    activity.type === "stage_change"
      ? activity.meta?.reason
      : activity.subject
        ? activity.body
        : null,
  ].filter(Boolean);

  const meta = (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground tabular-nums">
      {author ? `${author} · ` : ""}
      {timeOfDay(activity.occurred_at)}
      {activity.type === "stage_change" ? null : (
        // Shown while the row has the pointer or the button has focus.
        <span className="flex opacity-0 group-hover/activity:opacity-100 has-focus-visible:opacity-100">
          <Button aria-label="Delete" onClick={onRemove} size="icon-xs" variant="ghost">
            <TrashIcon />
          </Button>
        </span>
      )}
    </span>
  );

  return (
    <div className="group/activity flex min-w-0 gap-3 border-b py-3 leading-5 last:border-b-0">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {isTask ? (
          <Checkbox
            aria-label={activity.completed_at ? "Reopen task" : "Mark done"}
            checked={activity.completed_at !== null}
            onCheckedChange={(checked) => onComplete(checked === true)}
          />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 select-text">
        <div className="flex w-full min-w-0 items-baseline gap-3">
          {title ? (
            <p
              className="min-w-0 flex-1 font-medium text-foreground data-[done]:text-muted-foreground data-[done]:line-through"
              data-done={isTask && activity.completed_at ? true : undefined}
            >
              {title}
            </p>
          ) : (
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-pretty text-muted-foreground">
              {activity.body}
            </p>
          )}
          {meta}
        </div>
        {details.map((detail) => (
          <p className="whitespace-pre-wrap text-pretty text-muted-foreground" key={detail}>
            {detail}
          </p>
        ))}
        {synced || activity.external_url ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-muted-foreground">
            {synced ? <span className="tabular-nums">{synced}</span> : null}
            {activity.external_url ? (
              <a
                className="flex items-center gap-1 text-foreground underline decoration-input underline-offset-2 pointer-fine:hover:decoration-foreground"
                href={activity.external_url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {activity.type === "meeting" ? "Open event" : "Open thread"}
                <LaunchIcon className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}
        {overdue || dealName ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-muted-foreground">
            {overdue && activity.due_at ? (
              <span className="flex items-center gap-2">
                <StatusDot tone="error" />
                Overdue {daysSince(activity.due_at)}d ago
              </span>
            ) : null}
            {dealName && activity.deal_id ? (
              <button
                className="truncate text-foreground underline underline-offset-2"
                onClick={() => activity.deal_id && onOpenDeal(activity.deal_id)}
                type="button"
              >
                {dealName}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
