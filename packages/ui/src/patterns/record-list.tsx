import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import { Table, TableBody, TableCell, TableRow } from "@crm/ui/components/table";
import type { ReactNode } from "react";

const ChevronIcon = carbonIcon(chevronRight);

export interface RecordListItem {
  readonly id: string;
  /** The record's name. */
  readonly title: string;
  /** One quiet value after the name, such as a company's domain. */
  readonly meta?: string | null;
  /** A small mark before the name, such as a logo. */
  readonly icon?: ReactNode;
}

/**
 * CRM records as a framed table, as the agent shows them in a reply: the name and a quiet value
 * in aligned columns, and a chevron on hover. The whole row opens its record (the name's button
 * stretches over it), and the text stays copyable.
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
    <div data-slot="record-list" className="my-4 overflow-hidden rounded-lg border">
      <Table aria-label={label}>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="group/row relative cursor-pointer">
              <TableCell className="h-10 w-px px-3">
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="flex items-center gap-2.5 font-medium text-foreground outline-none select-text after:absolute after:inset-0 focus-visible:underline"
                >
                  {item.icon && (
                    <span className="flex size-4 shrink-0 items-center">{item.icon}</span>
                  )}
                  {item.title}
                </button>
              </TableCell>
              <TableCell className="h-10 px-3 text-muted-foreground select-text">
                {item.meta}
              </TableCell>
              <TableCell className="h-10 w-px pr-3 pl-0">
                <ChevronIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** A record named in a sentence: its name in medium weight, underlined on hover, opens it. */
export function RecordChip({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-slot="record-chip"
      onClick={onOpen}
      className="font-medium text-foreground underline decoration-transparent underline-offset-3 transition-colors outline-none select-text hover:decoration-current focus-visible:decoration-current"
    >
      {label}
    </button>
  );
}
