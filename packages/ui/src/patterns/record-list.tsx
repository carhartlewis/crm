import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import type { ReactNode } from "react";

const ChevronIcon = carbonIcon(chevronRight);

export interface RecordListItem {
  readonly id: string;
  /** The record's name. */
  readonly title: string;
  /** One quiet line after the name, such as a company's domain. */
  readonly meta?: string | null;
  /** A small mark before the name, such as a logo. */
  readonly icon?: ReactNode;
}

/**
 * CRM records in a framed list, one row each, as the agent shows them in a reply: the name, a
 * quiet detail, and a chevron on hover. A row opens its record. The text stays copyable.
 */
export function RecordList({
  items,
  label,
  onOpen,
}: {
  items: readonly RecordListItem[];
  /** Names the list for assistive tech, such as "Companies". */
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <ul
      aria-label={label}
      data-slot="record-list"
      className="my-4 divide-y overflow-hidden rounded-lg border"
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="group/row flex h-10 w-full min-w-0 items-center gap-2.5 px-3 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
          >
            {item.icon && <span className="flex size-4 shrink-0 items-center">{item.icon}</span>}
            <span className="min-w-0 truncate font-medium text-foreground select-text">
              {item.title}
            </span>
            {item.meta && (
              <span className="min-w-0 truncate text-muted-foreground select-text">
                {item.meta}
              </span>
            )}
            <ChevronIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A record named in a sentence, as a quiet inline button that opens it. */
export function RecordChip({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-slot="record-chip"
      onClick={onOpen}
      className="rounded-sm bg-muted px-1 font-medium text-foreground transition-colors outline-none select-text hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}
