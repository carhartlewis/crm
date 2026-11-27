import { Button } from "@crm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import { useRef } from "react";
import type { RecordKind } from "../../lib/records.ts";

const NOUNS: Record<RecordKind, { one: string; many: string }> = {
  company: { one: "company", many: "companies" },
  contact: { one: "contact", many: "contacts" },
  deal: { one: "deal", many: "deals" },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What else goes with the records, by kind (the database cascades as ADR 0023 says). */
export interface DeleteImpact {
  /** Deals of the companies being deleted. */
  readonly deals?: number;
  /** Contacts that lose their company (they stay). */
  readonly contacts?: number;
}

/** The consequences, in a sentence or two: what is lost and what stays. */
export function deleteConsequence(kind: RecordKind, count: number, impact: DeleteImpact = {}) {
  const one = count === 1;
  const its = one ? "its" : "their";
  const it = one ? "it" : "them";

  switch (kind) {
    case "company": {
      const deals = impact.deals ?? 0;
      const contacts = impact.contacts ?? 0;

      const lost =
        deals > 0
          ? `${plural(deals, "deal", "deals")} and all ${its} logged activity go with ${it}.`
          : `All ${its} logged activity goes with ${it}.`;

      const kept =
        contacts > 0
          ? ` ${plural(contacts, "contact stays", "contacts stay")}, without a company.`
          : ` ${one ? "Its" : "Their"} contacts stay, without a company.`;

      return lost + kept;
    }

    case "contact":
      return `${one ? "They leave" : "They each leave"} every deal they're on, and their logged activity is deleted. Companies and deals stay.`;

    case "deal":
      return `Who is on ${it} and ${its} logged activity go with ${it}. Companies and contacts stay.`;
  }
}

export interface ConfirmDeleteDialogProps {
  readonly kind: RecordKind;
  /** The records to delete; the dialog is open while this is not null. */
  readonly ids: readonly string[] | null;
  /** The record's name when there is one record. */
  readonly name?: string | undefined;
  readonly impact?: DeleteImpact;
  readonly pending?: boolean;
  readonly onConfirm: (ids: readonly string[]) => void;
  readonly onCancel: () => void;
}

/**
 * Asks before deleting forever, and names what is lost with the records. Cancel has focus, so
 * Enter never deletes by accident.
 */
export function ConfirmDeleteDialog({
  kind,
  ids,
  name,
  impact,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const count = ids?.length ?? 0;
  const noun = NOUNS[kind];
  const subject = count === 1 && name ? `“${name}”` : plural(count, noun.one, noun.many);

  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open={ids !== null}>
      <DialogContent initialFocus={() => cancel.current}>
        <DialogHeader>
          <DialogTitle>{`Delete ${subject}?`}</DialogTitle>
          <DialogDescription>
            {`${deleteConsequence(kind, count, impact)} This can't be undone. To hide ${count === 1 ? "it" : "them"} instead, archive.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} ref={cancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() => ids && onConfirm(ids)}
            type="button"
            variant="destructive"
          >
            {count === 1 ? `Delete ${noun.one}` : `Delete ${plural(count, noun.one, noun.many)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
