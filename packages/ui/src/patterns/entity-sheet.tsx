import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import overflowMenuVertical16 from "@carbon/icons/es/overflow-menu--vertical/16.js";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Skeleton } from "@crm/ui/components/skeleton";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { CloseGlyph } from "@crm/ui/patterns/close-glyph";
import { SkeletonLine } from "@crm/ui/patterns/skeleton-lines";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import { cn } from "cn";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from "react";

/**
 * The CRM record sheet from the Paper designs (Company, Contact and Deal record): a header row
 * with the mark, title, actions and Close on one line; a strip of key figures; underlined tabs with
 * counts; and edge-to-edge sections with small uppercase labels. Text is 14px, as in the rest
 * of the app; only section labels are 12px.
 */

const ChevronIcon = carbonIcon(chevronDown16);
const MoreIcon = carbonIcon(overflowMenuVertical16);

const TitleContext = createContext<RefObject<HTMLHeadingElement | null> | null>(null);

export type EntityTab<Tab extends string> = {
  id: Tab;
  label: string;
  /** Shown after the label, muted: "Contacts 3". */
  count?: number;
  content: ReactNode;
};

export function EntitySheet<Tab extends string>({
  open,
  onClose,
  label,
  loading = false,
  header,
  stats,
  tabs,
  tab,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for assistive tech, such as "Company". */
  label: string;
  loading?: boolean;
  header: ReactNode;
  stats?: ReactNode;
  tabs: readonly EntityTab<Tab>[];
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0];

  return (
    <TitleContext value={title}>
      <AdaptiveSheet
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        open={open}
        size="wide"
      >
        <AdaptiveSheetContent
          className="gap-0 overflow-hidden p-0 text-sm"
          initialFocus={() => title.current}
          showCloseButton={false}
        >
          <div className="sr-only">
            <AdaptiveSheetTitle>{label}</AdaptiveSheetTitle>
          </div>
          <EntityCloseContext value={onClose}>
            {loading ? <HeaderSkeleton /> : header}
          </EntityCloseContext>
          {loading ? null : stats}
          <div
            aria-label={`${label} sections`}
            className="no-scrollbar flex h-11 w-full shrink-0 items-stretch gap-6 overflow-x-auto border-b px-5 select-none"
            role="tablist"
          >
            {tabs.map((entry) => (
              <button
                aria-selected={entry.id === active?.id}
                className="relative flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground outline-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent aria-selected:text-foreground aria-selected:after:bg-foreground pointer-fine:hover:text-foreground focus-visible:underline"
                key={entry.id}
                onClick={() => onTabChange(entry.id)}
                role="tab"
                type="button"
              >
                {entry.label}
                {entry.count ? (
                  <span className="text-muted-foreground tabular-nums">{entry.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div
            aria-busy={loading || undefined}
            className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto select-text"
            role="tabpanel"
          >
            {loading ? <BodySkeleton /> : active?.content}
          </div>
        </AdaptiveSheetContent>
      </AdaptiveSheet>
    </TitleContext>
  );
}

const EntityCloseContext = createContext<() => void>(() => undefined);

const NO_MENU: readonly EntityMenuItem[] = [];

export type EntityMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * The header: one line, never more. Mark, title (truncated) and an optional short status such as
 * "Archived", then the actions, the "…" menu, a divider and Close.
 */
export function EntityHeader({
  leading,
  title,
  status,
  actions,
  menu = NO_MENU,
}: {
  leading?: ReactNode;
  title: string;
  /** A few muted words after the title, on the same line ("Archived", "Primary contact"). */
  status?: ReactNode;
  /** Outline buttons (`EntityAction`) or a control such as a stage picker. */
  actions?: ReactNode;
  menu?: readonly EntityMenuItem[];
}) {
  const titleRef = useContext(TitleContext);
  const onClose = useContext(EntityCloseContext);
  const regular = menu.filter((item) => !item.destructive);
  const destructive = menu.filter((item) => item.destructive);

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-3 border-b px-5">
      {leading ? <div className="flex shrink-0">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h2
          className="min-w-0 truncate font-medium text-foreground text-lg leading-6 tracking-tight outline-none select-text"
          ref={titleRef}
          tabIndex={-1}
          title={title}
        >
          {title}
        </h2>
        {status ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 select-none">
        {actions}
        {menu.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={UI_COPY.moreActions}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {regular.length > 0 ? (
                <DropdownMenuGroup>
                  {regular.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={item.onSelect}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
              {destructive.length > 0 ? (
                <DropdownMenuGroup>
                  {destructive.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={item.onSelect} variant="destructive">
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <Button aria-label={UI_COPY.close} onClick={onClose} size="icon-sm" variant="ghost">
          <CloseGlyph />
        </Button>
      </div>
    </header>
  );
}

/** An outline header button: icon and label, 28px high. */
export function EntityAction(props: ComponentProps<typeof Button>) {
  return <Button size="sm" type="button" variant="outline" {...props} />;
}

export type EntityStat = { readonly label: string; readonly value: ReactNode };

/** Key figures in equal cells on a faint band: label above, value below. */
export function EntityStats({ stats }: { stats: readonly EntityStat[] }) {
  return (
    <dl className="flex w-full shrink-0 border-b bg-muted/40 select-text">
      {stats.map((stat) => (
        <div
          className="flex min-w-0 flex-1 basis-0 flex-col gap-1 border-l px-5 py-3 first:border-l-0"
          key={stat.label}
        >
          <dt className="truncate text-muted-foreground leading-5">{stat.label}</dt>
          <dd className="flex min-w-0 items-center gap-2 truncate font-medium text-foreground text-sm leading-5 tabular-nums">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Main content and, beside it, a 320px column (the company's Details) behind a full-height rule,
 * so each side's section rules meet it instead of stopping short.
 */
export function EntityColumns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col group-data-[mode=sheet]/adaptive-sheet:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col">{main}</div>
      <div className="flex w-full shrink-0 flex-col group-data-[mode=sheet]/adaptive-sheet:w-80 group-data-[mode=sheet]/adaptive-sheet:border-l">
        {side}
      </div>
    </div>
  );
}

/** An edge-to-edge section: small uppercase label (with an optional aside or action), then content. */
export function EntitySection({
  label,
  aside,
  action,
  children,
}: {
  label: string;
  aside?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex w-full min-w-0 flex-col gap-3 border-b px-5 py-4 last:border-b-0">
      <div
        className="flex h-5 shrink-0 items-center justify-between gap-3 data-[action]:h-7"
        data-action={action ? true : undefined}
      >
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider select-none">
          {label}
        </h3>
        {aside ? <span className="truncate text-muted-foreground">{aside}</span> : null}
        {action}
      </div>
      {children}
    </section>
  );
}

/** Prose under a section label: muted, line-wrapped. */
export function EntityProse({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap text-pretty text-muted-foreground leading-5">{children}</p>
  );
}

/** Property rows, one column or two side by side. */
export function EntityProperties({
  children,
  columns = 1,
}: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <dl
      className="grid w-full min-w-0 grid-cols-1 gap-x-8 data-[columns=2]:group-data-[mode=sheet]/adaptive-sheet:grid-cols-2"
      data-columns={columns}
    >
      {children}
    </dl>
  );
}

/** One property: a 104px label, then the value or its editor (32px high). */
export function EntityProperty({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 min-w-0 items-center gap-2">
      <dt className="w-26 shrink-0 truncate text-muted-foreground leading-5 select-none">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center">{children}</dd>
    </div>
  );
}

/**
 * A property's value as a quiet control: 32px high, padded like the design, a hover fill, and a
 * chevron when it opens a menu. Pass it as a trigger's `render`, or use it as a button.
 */
export function EntityValue({
  className,
  children,
  menu = false,
  muted = false,
  ...props
}: ComponentProps<"button"> & { menu?: boolean; muted?: boolean }) {
  return (
    <button
      className={cn(
        "flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md px-2 text-left text-foreground leading-5 outline-none select-text data-[muted]:text-muted-foreground pointer-fine:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      data-muted={muted || undefined}
      type="button"
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
      {menu ? <ChevronIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
    </button>
  );
}

/** Multi-line text you can click to edit (About, Description): padded, a hover fill, wraps. */
export function EntityProseValue({
  className,
  empty = false,
  quiet = false,
  ...props
}: ComponentProps<"button"> & {
  empty?: boolean;
  /** Muted text, for summaries such as a company's About. */
  quiet?: boolean;
}) {
  return (
    <button
      className={cn(
        "-mx-2 -my-1 self-stretch rounded-md px-2 py-1 text-left text-foreground leading-5 whitespace-pre-wrap text-pretty outline-none select-text data-[empty]:text-muted-foreground data-[quiet]:text-muted-foreground pointer-fine:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      data-empty={empty || undefined}
      data-quiet={quiet || undefined}
      type="button"
      {...props}
    />
  );
}

/** A read-only property value, padded to line up with the editable ones. */
export function EntityText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className="block min-w-0 truncate px-2 py-1 text-foreground leading-5 data-[muted]:text-muted-foreground"
      data-muted={muted || undefined}
    >
      {children}
    </span>
  );
}

export type EntityTableColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Share of the table's width, such as `24%`; columns without one split what is left. */
  readonly width?: string;
  readonly align?: "start" | "end";
};

const isControl = (target: EventTarget) =>
  target instanceof Element && target.closest("button, a, input") !== null;

/**
 * A sheet tab's list (a company's contacts, a deal's contacts, a company's deals): edge to edge,
 * a 36px header, rows with a rule under each, the first column inset to the sheet's edge.
 * Rows open their record; controls inside a row keep their own clicks.
 */
export function EntityTable<Row>({
  label,
  columns,
  rows,
  getRowId,
  onRowClick,
  leading,
  trailing,
  empty,
}: {
  label: string;
  columns: readonly EntityTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** A narrow cell before the first column, such as the primary-contact star. */
  leading?: { readonly label: string; readonly cell: (row: Row) => ReactNode };
  /** A narrow cell after the last column, such as Remove. */
  trailing?: { readonly label: string; readonly cell: (row: Row) => ReactNode };
  empty: ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-muted-foreground">{empty}</p>;
  }

  return (
    <table aria-label={label} className="w-full min-w-0 table-fixed border-collapse">
      <colgroup>
        {leading ? <col className="w-9.5" /> : null}
        {columns.map((column) => (
          <col key={column.id} style={column.width ? { width: column.width } : undefined} />
        ))}
        {trailing ? <col className="w-11" /> : null}
      </colgroup>
      <thead>
        <tr className="h-10 border-b text-left text-muted-foreground select-none">
          {leading ? (
            <th className="font-normal" scope="col">
              <span className="sr-only">{leading.label}</span>
            </th>
          ) : null}
          {columns.map((column, index) => (
            <th
              className="truncate px-3 font-normal data-[align=end]:text-right data-[first]:pl-5"
              data-align={column.align}
              data-first={!leading && index === 0 ? true : undefined}
              key={column.id}
              scope="col"
            >
              {column.header}
            </th>
          ))}
          {trailing ? (
            <th className="font-normal" scope="col">
              <span className="sr-only">{trailing.label}</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            className="border-b pointer-fine:hover:bg-accent/50 data-[clickable]:cursor-pointer"
            data-clickable={onRowClick ? true : undefined}
            key={getRowId(row)}
            onClick={(event) => {
              if (!isControl(event.target)) onRowClick?.(row);
            }}
          >
            {leading ? <td className="pl-5 align-middle">{leading.cell(row)}</td> : null}
            {columns.map((column, index) => (
              <td
                className="px-3 py-3 align-middle leading-5 data-[first]:pl-5"
                data-first={!leading && index === 0 ? true : undefined}
                key={column.id}
              >
                <span
                  className="flex min-w-0 items-center gap-2 truncate data-[align=end]:justify-end data-[align=end]:tabular-nums"
                  data-align={column.align}
                >
                  {column.cell(row)}
                </span>
              </td>
            ))}
            {trailing ? (
              <td className="pr-3 text-right align-middle">{trailing.cell(row)}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The bar above a sheet tab's list: what it holds on the left ("3 contacts"), its actions (Add
 * deal) on the right.
 */
export function EntityToolbar({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-13 w-full shrink-0 items-center justify-between gap-3 border-b px-5 select-none">
      <span className="truncate text-muted-foreground tabular-nums">{summary}</span>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

function HeaderSkeleton() {
  const titleRef = useContext(TitleContext);

  return (
    <header className="flex w-full shrink-0 items-center gap-3 border-b px-5 py-3">
      <Skeleton className="size-8" />
      <h2 className="flex min-w-0 flex-1 outline-none" ref={titleRef} tabIndex={-1}>
        <SkeletonLine size="lg" width="64" />
      </h2>
    </header>
  );
}

function BodySkeleton() {
  return (
    <div className="flex flex-col gap-2 px-5 py-3">
      <SkeletonLine width="24" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
