import { USAGE_EXPORT_PATH } from "@crm/core/api";
import { formatUsage, usageMonthLabel } from "@crm/core/usage";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm/ui/components/table";
import { parseAsString, useQueryState } from "nuqs";
import {
  type UsageLine,
  type UsageReport,
  usageMonths,
  usageReport,
  useUsage,
} from "../../lib/usage.ts";
import { useMembers } from "../records/use-crm.ts";
import { SettingsCard } from "./settings-card.tsx";
import { SettingsPage } from "./settings-page.tsx";

/**
 * Workspace settings → Usage (ADR 0027): what the workspace's paid lookups cost in a month, read
 * live from the synced ledger, by day, by what ran them, by member and by lookup, plus the month
 * as CSV for billing. Owners and admins also see what the lookups cost us.
 */
export function UsageSettings({
  workspaceId,
  userId,
  currentMonth,
}: {
  workspaceId: string;
  userId: string;
  /** The month it is now, `YYYY-MM`, from the route loader. */
  currentMonth: string;
}) {
  const [picked, setMonth] = useQueryState("month", parseAsString);
  const { events, costs, markupBps } = useUsage(workspaceId);
  const { nameOf } = useMembers(userId, workspaceId);
  const months = usageMonths(events, currentMonth);
  const month = picked && months.includes(picked) ? picked : currentMonth;
  const report = usageReport(events, costs, month, (id) => nameOf(id) ?? "Former member");
  const admin = report.costMicro !== null;

  const monthPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label="Month" size="sm" variant="outline" />}>
        {usageMonthLabel(month)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {months.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => void setMonth(option === currentMonth ? null : option)}
          >
            {usageMonthLabel(option)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const exportCsv = (
    <Button
      size="sm"
      variant="outline"
      render={
        <a href={`${USAGE_EXPORT_PATH}?month=${month}`} download>
          Export CSV
        </a>
      }
    >
      Export CSV
    </Button>
  );

  return (
    <SettingsPage title="Usage" actions={exportCsv}>
      <SettingsCard
        title={month === currentMonth ? "This month" : usageMonthLabel(month)}
        description="What people search, email and phone finding, and enrichment cost the workspace, from chats, record actions and research on new records."
        headerAction={monthPicker}
        hint={
          report.calls === 0
            ? "No paid lookups yet this month."
            : "Answers the CRM already had cost nothing."
        }
      >
        <div className="flex flex-col gap-6">
          <Totals report={report} admin={admin} markupBps={markupBps} />
          <DailyBars report={report} />
        </div>
      </SettingsCard>

      {report.calls > 0 ? (
        <>
          <Breakdown
            title="By source"
            description="What ran the lookups."
            lines={report.origins}
            admin={admin}
          />
          <Breakdown
            title="By member"
            description="Whose chats and records ran them."
            lines={report.members}
            admin={admin}
          />
          <Breakdown
            title="By lookup"
            description="Each kind of lookup and what it cost."
            lines={report.jobs}
            admin={admin}
          />
        </>
      ) : null}
    </SettingsPage>
  );
}

function Totals({
  report,
  admin,
  markupBps,
}: {
  report: UsageReport;
  admin: boolean;
  markupBps: number;
}) {
  const stats = [
    { label: "Spend", value: formatUsage(report.priceMicro) },
    { label: "Lookups", value: report.calls.toLocaleString("en-US") },
    ...(admin
      ? [
          { label: "Our cost", value: formatUsage(report.costMicro ?? 0) },
          { label: "Markup", value: `${Math.round(markupBps / 100)}%` },
        ]
      : []),
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 select-none sm:grid-cols-4">
      {stats.map((stat) => (
        <div className="flex min-w-0 flex-col gap-0.5" key={stat.label}>
          <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="truncate text-base font-medium tabular-nums select-text">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One bar per day of the month, its height its share of the busiest day; quiet days are a stub. */
function DailyBars({ report }: { report: UsageReport }) {
  const peak = Math.max(...report.days.map((day) => day.priceMicro), 1);

  return (
    <figure aria-label="Spend by day" className="flex h-16 items-end gap-0.5 select-none">
      {report.days.map((day) => (
        <div
          className={
            day.priceMicro > 0
              ? "min-w-0 flex-1 rounded-xs bg-foreground/60"
              : "h-0.5 min-w-0 flex-1 rounded-xs bg-muted"
          }
          key={day.day}
          style={
            day.priceMicro > 0
              ? { height: `${Math.max(8, (day.priceMicro / peak) * 100)}%` }
              : undefined
          }
          title={`${day.day}: ${formatUsage(day.priceMicro)}`}
        />
      ))}
    </figure>
  );
}

function Breakdown({
  title,
  description,
  lines,
  admin,
}: {
  title: string;
  description: string;
  lines: readonly UsageLine[];
  admin: boolean;
}) {
  return (
    <SettingsCard title={title} description={description}>
      <Table aria-label={title}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>
              <span className="block text-right">Lookups</span>
            </TableHead>
            <TableHead>
              <span className="block text-right">Spend</span>
            </TableHead>
            {admin ? (
              <TableHead>
                <span className="block text-right">Our cost</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.key}>
              <TableCell>
                <span className="block max-w-64 truncate select-text">{line.label}</span>
              </TableCell>
              <TableCell>
                <span className="block text-right tabular-nums">{line.calls}</span>
              </TableCell>
              <TableCell>
                <span className="block text-right tabular-nums">
                  {formatUsage(line.priceMicro)}
                </span>
              </TableCell>
              {admin ? (
                <TableCell>
                  <span className="block text-right tabular-nums text-muted-foreground">
                    {formatUsage(line.costMicro ?? 0)}
                  </span>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsCard>
  );
}
