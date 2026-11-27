import { DEAL_STAGES, dealStage } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@crm/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { Input } from "@crm/ui/components/input";
import { BulkOptionMenu } from "@crm/ui/patterns/data-table/bulk-actions";
import { useRef, useState } from "react";
import type { Member } from "./use-crm.ts";

/**
 * Bulk edits for a record list's selection menu (`RecordTable`'s `bulkActions`). Items live in
 * the menu; their dialogs are rendered by the list, outside it, so closing the menu keeps them.
 */

const NO_OWNER = "none";

/** Assign owner: every member, plus Unassigned. */
export function AssignOwnerMenu({
  members,
  onAssign,
}: {
  members: readonly Member[];
  onAssign: (ownerId: string | null) => void;
}) {
  return (
    <BulkOptionMenu
      label="Assign owner"
      onSelect={(value) => onAssign(value === NO_OWNER ? null : value)}
      options={[
        ...members.map((member) => ({ value: member.id, label: member.name })),
        { value: NO_OWNER, label: "Unassigned" },
      ]}
    />
  );
}

/** Set stage: every stage; a losing one asks why first (`LosingReasonDialog`). */
export function SetStageMenu({ onPick }: { onPick: (stage: string) => void }) {
  return (
    <BulkOptionMenu
      label="Set stage"
      onSelect={onPick}
      options={DEAL_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))}
    />
  );
}

/** Opens the company picker. */
export function SetCompanyItem({ onOpen }: { onOpen: () => void }) {
  return <DropdownMenuItem onClick={onOpen}>Set company…</DropdownMenuItem>;
}

/** What a bulk dialog acts on. */
export interface BulkTarget<T = undefined> {
  readonly ids: readonly string[];
  readonly value: T;
}

/** Why the selected deals closed lost or unqualified, as the API requires. */
export function LosingReasonDialog({
  target,
  onConfirm,
  onCancel,
}: {
  target: BulkTarget<string> | null;
  onConfirm: (target: BulkTarget<string>, reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const count = target?.ids.length ?? 0;

  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open={target !== null}>
      <DialogContent initialFocus={() => input.current}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();

            if (!target || !reason.trim()) return;

            onConfirm(target, reason.trim());
            setReason("");
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {target
                ? `Mark ${count} ${count === 1 ? "deal" : "deals"} as ${dealStage(target.value).label.toLowerCase()}`
                : ""}
            </DialogTitle>
            <DialogDescription>Say why, so the team can learn from it.</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Reason"
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder="Went with a competitor on price"
            ref={input}
            value={reason}
          />
          <DialogFooter>
            <Button onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!reason.trim()} type="submit">
              {count === 1 ? "Close deal" : "Close deals"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Searches the workspace's companies and moves the selected contacts to the one picked. */
export function CompanyPickerDialog({
  target,
  companies,
  onPick,
  onCancel,
}: {
  target: BulkTarget | null;
  companies: readonly { id: string; name: string }[];
  onPick: (target: BulkTarget, companyId: string | null) => void;
  onCancel: () => void;
}) {
  const count = target?.ids.length ?? 0;

  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open={target !== null}>
      <DialogContent>
        <DialogHeader className="sr-only">
          <DialogTitle>{`Set company for ${count} ${count === 1 ? "contact" : "contacts"}`}</DialogTitle>
          <DialogDescription>Search for a company, or remove their company.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search companies…" />
          <CommandList>
            <CommandEmpty>No company has that name.</CommandEmpty>
            {companies.map((company) => (
              <CommandItem
                key={company.id}
                onSelect={() => target && onPick(target, company.id)}
                value={`${company.name} ${company.id}`}
              >
                <span className="truncate select-text">{company.name}</span>
              </CommandItem>
            ))}
            <CommandItem onSelect={() => target && onPick(target, null)} value="No company">
              No company
            </CommandItem>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
