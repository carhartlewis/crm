import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import type { ReactNode } from "react";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { UI_COPY } from "@crm/ui/patterns/ui-copy";

const ChevronDownIcon = carbonIcon(chevronDown16);

/** The "Actions" menu that a DataTable's selection bar shows for the selected rows. */
export function BulkActionsMenu({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={pending} render={<Button size="sm" variant="outline" />}>
        {UI_COPY.bulkActions}
        {pending ? <Spinner data-icon="inline-end" /> : <ChevronDownIcon data-icon="inline-end" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BulkOptionMenu<TValue extends string>({
  label,
  icon,
  options,
  onSelect,
  empty,
}: {
  label: string;
  icon?: ReactNode;
  options: readonly { value: TValue; label: string }[];
  onSelect: (value: TValue) => void;
  empty?: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon}
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
        {options.length === 0 && empty ? (
          <DropdownMenuItem disabled>{empty}</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuItem key={option.value} onClick={() => onSelect(option.value)}>
              {option.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
