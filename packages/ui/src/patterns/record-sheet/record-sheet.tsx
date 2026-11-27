import overflowMenuHorizontal16 from "@carbon/icons/es/overflow-menu--horizontal/16.js";
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
import { cn } from "cn";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetTitle,
  useAdaptiveSheetMode,
} from "@crm/ui/patterns/adaptive-sheet";
import { CloseGlyph } from "@crm/ui/patterns/close-glyph";
import { SkeletonLine } from "@crm/ui/patterns/skeleton-lines";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import { createContext, type ReactNode, type RefObject, useContext, useRef } from "react";
import { RecordRail } from "./record-rail";
import { type RecordTabSpec, RecordTabs } from "./record-tabs";

const EllipsisIcon = carbonIcon(overflowMenuHorizontal16);

const RecordTitleContext = createContext<RefObject<HTMLHeadingElement | null> | null>(null);

type RecordSheetProps<Tab extends string> = {
  open: boolean;
  onClose: () => void;
  label: string;
  header: ReactNode;
  tabs: RecordTabSpec<Tab>[];
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  rail: ReactNode;
  loading?: boolean;
  placeholder?: ReactNode;
};

export function RecordSheet<Tab extends string>({
  open,
  onClose,
  ...content
}: RecordSheetProps<Tab>) {
  const title = useRef<HTMLHeadingElement>(null);

  return (
    <RecordTitleContext value={title}>
      <AdaptiveSheet
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        open={open}
        size="wide"
      >
        <RecordSheetContent {...content} onClose={onClose} title={title} />
      </AdaptiveSheet>
    </RecordTitleContext>
  );
}

function RecordSheetContent<Tab extends string>({
  onClose,
  label,
  header,
  tabs,
  tab,
  onTabChange,
  rail,
  loading = false,
  placeholder,
  title,
}: Omit<RecordSheetProps<Tab>, "open"> & {
  title: RefObject<HTMLHeadingElement | null>;
}) {
  const mode = useAdaptiveSheetMode();
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0];
  const fills = active?.fills === true && !loading && mode === "sheet";

  return (
    <AdaptiveSheetContent
      className="gap-0 p-0"
      initialFocus={() => title.current}
      showCloseButton={false}
    >
      <div className="sr-only">
        <AdaptiveSheetTitle>{label}</AdaptiveSheetTitle>
      </div>

      <div className="flex h-13 shrink-0 items-center justify-between border-b px-4 group-data-[mode=sheet]/adaptive-sheet:pr-6 group-data-[mode=sheet]/adaptive-sheet:pl-8">
        <span className="truncate text-label text-muted-foreground">{label}</span>
        <Button aria-label={UI_COPY.close} onClick={onClose} size="icon-sm" variant="ghost">
          <CloseGlyph />
        </Button>
      </div>

      {loading ? <RecordHeaderSkeleton label={label} /> : header}

      {placeholder ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center text-muted-foreground">
          {placeholder}
        </div>
      ) : (
        <div
          aria-busy={loading || undefined}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden text-pretty select-text group-data-[mode=sheet]/adaptive-sheet:flex-row group-data-[mode=sheet]/adaptive-sheet:gap-12 group-data-[mode=sheet]/adaptive-sheet:overflow-hidden group-data-[mode=sheet]/adaptive-sheet:px-8 group-data-[mode=sheet]/adaptive-sheet:pt-5"
        >
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-4.5 px-4 pt-3 pb-6 group-data-[mode=sheet]/adaptive-sheet:min-h-0 group-data-[mode=sheet]/adaptive-sheet:flex-1 group-data-[mode=sheet]/adaptive-sheet:shrink group-data-[mode=sheet]/adaptive-sheet:px-0 group-data-[mode=sheet]/adaptive-sheet:pt-0 group-data-[mode=sheet]/adaptive-sheet:pb-0">
            {tabs.length > 1 ? (
              <RecordTabs onChange={onTabChange} tabs={tabs} value={active?.id ?? tab} />
            ) : null}
            <div
              className={cn(
                "flex min-w-0 flex-col gap-4.5 *:shrink-0 group-data-[mode=sheet]/adaptive-sheet:min-h-0 group-data-[mode=sheet]/adaptive-sheet:flex-1 group-data-[mode=sheet]/adaptive-sheet:pb-6",
                fills
                  ? "overflow-hidden"
                  : "group-data-[mode=sheet]/adaptive-sheet:overflow-y-auto group-data-[mode=sheet]/adaptive-sheet:overflow-x-hidden",
              )}
            >
              {loading ? <SectionSkeleton /> : active?.content}
            </div>
          </div>
          <RecordRail>{loading ? <RailSkeleton /> : rail}</RecordRail>
        </div>
      )}
    </AdaptiveSheetContent>
  );
}

export type RecordMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

const NO_ITEMS: readonly RecordMenuItem[] = [];

function RecordMenuContent({ items }: { items: readonly RecordMenuItem[] }) {
  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);

  const render = (item: RecordMenuItem) => (
    <DropdownMenuItem
      disabled={item.disabled}
      key={item.id}
      onClick={item.onSelect}
      variant={item.destructive ? "destructive" : "default"}
    >
      {item.icon}
      {item.label}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenuContent align="end" className="min-w-48">
      {regular.length > 0 ? <DropdownMenuGroup>{regular.map(render)}</DropdownMenuGroup> : null}
      {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
      {destructive.length > 0 ? (
        <DropdownMenuGroup>{destructive.map(render)}</DropdownMenuGroup>
      ) : null}
    </DropdownMenuContent>
  );
}

export function RecordMenu({ items }: { items: readonly RecordMenuItem[] }) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={UI_COPY.moreActions}
        render={<Button size="icon-sm" variant="outline" />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <RecordMenuContent items={items} />
    </DropdownMenu>
  );
}

export function RecordRowMenu({
  label,
  items,
}: {
  label: string;
  items: readonly RecordMenuItem[];
}) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        render={
          <Button
            className="-my-1 text-muted-foreground aria-expanded:text-foreground pointer-fine:hover:text-foreground"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <RecordMenuContent items={items} />
    </DropdownMenu>
  );
}

function RecordActionButtons({ actions }: { actions: readonly RecordMenuItem[] }) {
  return actions.map((action) => (
    <Button
      className={cn(action.destructive && "text-destructive pointer-fine:hover:text-destructive")}
      disabled={action.disabled}
      key={action.id}
      onClick={action.onSelect}
      size="sm"
      type="button"
      variant="outline"
    >
      {action.icon}
      {action.label}
    </Button>
  ));
}

export function RecordHeader({
  title,
  code,
  actions = NO_ITEMS,
  menu = NO_ITEMS,
}: {
  title: string;
  code?: string;
  actions?: readonly RecordMenuItem[];
  menu?: readonly RecordMenuItem[];
}) {
  const titleRef = useContext(RecordTitleContext);
  const mode = useAdaptiveSheetMode();
  const showCode = code !== undefined && code !== title;

  return (
    <header className="shrink-0 border-b px-4 py-3 select-text group-data-[mode=sheet]/adaptive-sheet:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            className="truncate text-title outline-none"
            ref={titleRef}
            tabIndex={-1}
            title={title}
          >
            {title}
          </h2>
          {showCode ? (
            <p className="truncate font-mono text-caption text-muted-foreground">{code}</p>
          ) : null}
        </div>
        {mode === "sheet" ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <RecordActionButtons actions={actions} />
            <RecordMenu items={menu} />
          </div>
        ) : (
          <RecordMenu items={[...actions, ...menu]} />
        )}
      </div>
    </header>
  );
}

function RecordHeaderSkeleton({ label }: { label: string }) {
  const titleRef = useContext(RecordTitleContext);

  return (
    <header className="shrink-0 border-b px-4 py-3 group-data-[mode=sheet]/adaptive-sheet:px-8">
      <h2 className="flex h-12 min-w-0 items-center outline-none" ref={titleRef} tabIndex={-1}>
        <span className="sr-only">{UI_COPY.loadingRecord(label)}</span>
        <SkeletonLine size="lg" width="64" />
      </h2>
    </header>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-7 items-center">
        <SkeletonLine width="24" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

const RAIL_SKELETON_ROWS = ["first", "second", "third", "fourth", "fifth"];

function RailSkeleton() {
  return (
    <div className="flex min-w-0 flex-col">
      {RAIL_SKELETON_ROWS.map((row) => (
        <div className="flex min-h-9 min-w-0 items-center justify-between gap-3" key={row}>
          <SkeletonLine width="24" />
          <SkeletonLine width="40" />
        </div>
      ))}
    </div>
  );
}
