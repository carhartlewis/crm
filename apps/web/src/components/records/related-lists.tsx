import add16 from "@carbon/icons/es/add/16.js";
import close16 from "@carbon/icons/es/close/16.js";
import star16 from "@carbon/icons/es/star/16.js";
import starFilled16 from "@carbon/icons/es/star--filled/16.js";
import { contactName, DEAL_CONTACT_ROLE_FIELD } from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@crm/ui/components/command";
import { carbonIcon } from "@crm/ui/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@crm/ui/components/popover";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import { EntityTable, type EntityTableColumn, EntityToolbar } from "@crm/ui/patterns/entity-sheet";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Contact } from "../../lib/contacts.ts";
import type { Deal } from "../../lib/deals.ts";
import { calendarDate } from "../../lib/record-format.ts";
import { TextDetail } from "./detail-fields.tsx";
import { ContactAvatar, MemberAvatar, MoneyCell, MARK_SIZE } from "./record-visuals.tsx";
import type { Member } from "./use-crm.ts";
import { type StageChange, StageMenu } from "./stage-menu.tsx";

const AddIcon = carbonIcon(add16);
const CloseIcon = carbonIcon(close16);
const StarIcon = carbonIcon(star16);
const StarFilledIcon = carbonIcon(starFilled16);

/** A sheet tab's list with its toolbar: the count, and the Add button on the right. */
export function ListTab({
  summary,
  action,
  children,
}: {
  summary: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <EntityToolbar summary={summary}>{action}</EntityToolbar>
      {children}
    </div>
  );
}

/** The toolbar's Add button. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button onClick={onClick} size="sm" variant="outline">
      <AddIcon />
      {label}
    </Button>
  );
}

/** "Add contact" that searches existing people, with a way to make a new one. */
export function AddContactRow({
  contacts,
  onPick,
  onCreate,
}: {
  contacts: readonly Contact[];
  onPick: (contact: Contact) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={<Button size="sm" variant="outline" />}>
        <AddIcon />
        Add contact
      </PopoverTrigger>
      <PopoverContent align="end" flush>
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No one matches.</CommandEmpty>
            <CommandGroup>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  onSelect={() => {
                    setOpen(false);
                    onPick(contact);
                  }}
                  value={`${contactName(contact)} ${contact.email ?? ""} ${contact.id}`}
                >
                  <ContactAvatar contact={contact} size={MARK_SIZE} />
                  <span className="truncate">{contactName(contact)}</span>
                  {contact.title ? (
                    <span className="ml-auto truncate text-muted-foreground">{contact.title}</span>
                  ) : null}
                </CommandItem>
              ))}
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onCreate();
                }}
                value="__new new contact"
              >
                <AddIcon />
                New contact…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A member with their picture, or a dash when unassigned. */
function Owner({ owner }: { owner: Member | null }) {
  if (!owner) return <EmptyCellDash />;

  return (
    <>
      <MemberAvatar member={owner} size={MARK_SIZE} />
      <span className="truncate text-foreground">{owner.name}</span>
    </>
  );
}

function Muted({ text }: { text: string | null }) {
  return text ? <span className="truncate text-muted-foreground">{text}</span> : <EmptyCellDash />;
}

function Plain({ text }: { text: string | null }) {
  return text ? <span className="truncate text-foreground">{text}</span> : <EmptyCellDash />;
}

/** A deal contact's role, edited in place (Enter saves, Escape cancels). */
function roleCell(role: DealRole) {
  return function RoleCell(row: Contact) {
    return (
      // Pulled out by the editor's padding so its text lines up with the header and the row
      // keeps its height.
      <span className="-mx-2 -my-1.5 flex w-full min-w-0">
        <TextDetail
          onSave={(value) => role.onSave(row.id, value)}
          spec={DEAL_CONTACT_ROLE_FIELD}
          value={role.of(row.id)}
        />
      </span>
    );
  };
}

function contactColumns(
  ownerOf: (id: string | null) => Member | null,
  role: DealRole | undefined,
): EntityTableColumn<Contact>[] {
  const name: EntityTableColumn<Contact> = {
    id: "name",
    header: "Name",
    width: role ? "24%" : "28%",
    cell: (row) => (
      <>
        <ContactAvatar contact={row} size={MARK_SIZE} />
        <span className="truncate font-medium text-foreground">{contactName(row)}</span>
      </>
    ),
  };

  return [
    name,
    ...(role ? [{ id: "role", header: "Role", width: "18%", cell: roleCell(role) }] : []),
    { id: "title", header: "Title", cell: (row) => <Plain text={row.title} /> },
    {
      id: "email",
      header: "Email",
      width: role ? "22%" : "26%",
      cell: (row) => <Muted text={row.email} />,
    },
    {
      id: "owner",
      header: "Owner",
      width: role ? "18%" : "22%",
      cell: (row) => <Owner owner={ownerOf(row.owner_id)} />,
    },
  ];
}

/** Each contact's role on a deal, and how to change it. */
export interface DealRole {
  readonly of: (contactId: string) => string | null;
  readonly onSave: (contactId: string, role: string | null) => void;
}

function primaryStar(primaryId: string | null | undefined, onPrimary: (id: string | null) => void) {
  return function PrimaryStar(row: Contact) {
    const primary = row.id === primaryId;

    return (
      <button
        aria-label={primary ? "Primary contact" : "Make primary contact"}
        aria-pressed={primary}
        className="flex text-muted-foreground outline-none aria-pressed:text-foreground pointer-fine:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onPrimary(primary ? null : row.id)}
        type="button"
      >
        {primary ? <StarFilledIcon className="size-3" /> : <StarIcon className="size-3" />}
      </button>
    );
  };
}

function removeButton(onRemove: (contactId: string) => void) {
  return function RemoveFromDeal(row: Contact) {
    return (
      <Button
        aria-label={`Remove ${contactName(row)} from this deal`}
        onClick={() => onRemove(row.id)}
        size="icon-xs"
        variant="ghost"
      >
        <CloseIcon />
      </Button>
    );
  };
}

/**
 * People in a sheet tab: a company's contacts (with the primary star) or a deal's (with Remove).
 * Rows open the contact's sheet.
 */
export function ContactsList({
  contacts,
  ownerOf,
  onOpen,
  primaryId,
  onPrimary,
  onRemove,
  role,
}: {
  contacts: readonly Contact[];
  ownerOf: (id: string | null) => Member | null;
  onOpen: (id: string) => void;
  /** The company's primary contact, with the star column to change it. */
  primaryId?: string | null;
  onPrimary?: (id: string | null) => void;
  /** Takes the contact off the deal. */
  onRemove?: (contactId: string) => void;
  /** A deal's contacts: the Role column, edited in place. */
  role?: DealRole;
}) {
  return (
    <EntityTable
      columns={contactColumns(ownerOf, role)}
      empty="No one here yet."
      getRowId={(row) => row.id}
      label="Contacts"
      leading={
        onPrimary ? { label: "Primary", cell: primaryStar(primaryId, onPrimary) } : undefined
      }
      onRowClick={(row) => onOpen(row.id)}
      rows={contacts}
      trailing={onRemove ? { label: "Remove", cell: removeButton(onRemove) } : undefined}
    />
  );
}

function dealColumns(
  ownerOf: (id: string | null) => Member | null,
  onStage: (id: string, change: StageChange) => void,
  roleOf: ((dealId: string) => string | null) | undefined,
): EntityTableColumn<Deal>[] {
  return [
    {
      id: "name",
      header: "Deal",
      width: roleOf ? "25%" : "31%",
      cell: (row) => <span className="truncate font-medium text-foreground">{row.name}</span>,
    },
    ...(roleOf
      ? [
          {
            id: "role",
            header: "Role",
            width: "14%",
            cell: (row: Deal) => <Muted text={roleOf(row.id)} />,
          },
        ]
      : []),
    {
      id: "stage",
      header: "Stage",
      width: roleOf ? "21%" : "27%",
      cell: (row) => (
        <StageMenu
          onChange={(change) => onStage(row.id, change)}
          stage={row.stage}
          variant="cell"
        />
      ),
    },
    {
      id: "amount",
      header: "Amount",
      width: "12%",
      align: "end",
      cell: (row) => <MoneyCell amount={row.amount} currency={row.currency} />,
    },
    {
      id: "close",
      header: "Close date",
      width: "14%",
      cell: (row) => <Muted text={calendarDate(row.expected_close_date)} />,
    },
    {
      id: "owner",
      header: "Owner",
      width: "0.7fr",
      cell: (row) => <Owner owner={ownerOf(row.owner_id)} />,
    },
  ];
}

/** Deals in a sheet tab (a company's or a contact's). Rows open the deal's sheet. */
export function DealsList({
  deals,
  ownerOf,
  onOpen,
  onStage,
  roleOf,
}: {
  deals: readonly Deal[];
  ownerOf: (id: string | null) => Member | null;
  onOpen: (id: string) => void;
  onStage: (id: string, change: StageChange) => void;
  /** A contact's deals: their role on each. */
  roleOf?: (dealId: string) => string | null;
}) {
  return (
    <EntityTable
      columns={dealColumns(ownerOf, onStage, roleOf)}
      empty="No deals yet."
      getRowId={(row) => row.id}
      label="Deals"
      onRowClick={(row) => onOpen(row.id)}
      rows={deals}
    />
  );
}
