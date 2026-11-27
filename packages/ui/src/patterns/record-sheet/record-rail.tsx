import { cn } from "cn";
import { useAdaptiveSheetMode } from "@crm/ui/patterns/adaptive-sheet";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";
import arrowUpRight16 from "@carbon/icons/es/arrow--up-right/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import type { ReactNode } from "react";
import { orderFacts, type RailFactKind } from "./rail-fact-kinds";

const ArrowUpRightIcon = carbonIcon(arrowUpRight16);

export function RecordRail({ children }: { children: ReactNode }) {
  const mode = useAdaptiveSheetMode();

  if (mode === "drawer") {
    return (
      <section className="flex w-full min-w-0 shrink-0 flex-col gap-2.5 border-t px-4 pt-4.5 pb-6">
        <h3 className="text-label text-muted-foreground">{UI_COPY.recordDetails}</h3>
        {children}
      </section>
    );
  }

  return (
    <div className="flex h-full w-80 min-w-0 shrink-0 flex-col gap-4.5 self-stretch overflow-y-auto overflow-x-hidden pr-2 pb-6">
      {children}
    </div>
  );
}

export type RailFactItem = {
  kind: RailFactKind;
  label: string;
  value: ReactNode;
};

export function RailFacts({ facts }: { facts: readonly RailFactItem[] }) {
  return (
    <dl className="flex min-w-0 flex-col">
      {orderFacts(facts).map((fact) => (
        <RailFact key={fact.label} {...fact} />
      ))}
    </dl>
  );
}

function RailFact({ kind, label, value }: RailFactItem) {
  return (
    <div className="flex min-h-9 min-w-0 shrink-0 items-center justify-between gap-3 text-body">
      <dt className="w-28 shrink-0 truncate text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 truncate text-right text-foreground",
          kind === "code" && "font-mono",
          kind === "count" && "tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function RailMuted({ children }: { children: ReactNode }) {
  return <span className="truncate text-muted-foreground">{children}</span>;
}

export function RailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="group/rail-link inline-flex min-w-0 items-center gap-1 rounded-sm text-foreground outline-none"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <span className="truncate underline decoration-input underline-offset-3">{children}</span>
      <ArrowUpRightIcon className="hidden size-3 shrink-0 text-muted-foreground group-hover/rail-link:block group-focus-visible/rail-link:block" />
    </a>
  );
}
